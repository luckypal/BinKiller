const path = require('path');
const MTProto = require('@mtproto/core');
const prompts = require('prompts');

const {
  TELEGRAM_API_ID,
  TELEGRAM_API_HASH,
  TELEGRAM_DCID
} = process.env;

let {
  TELEGRAM_CHANNEL_ID
} = process.env;

TELEGRAM_CHANNEL_ID = parseInt(TELEGRAM_CHANNEL_ID);

// 1. Create instance
const mtproto = new MTProto({
  api_id: TELEGRAM_API_ID,
  api_hash: TELEGRAM_API_HASH,

  storageOptions: {
    path: path.resolve(__dirname, './data/1.json'),
  },
});

mtproto.setDefaultDc(TELEGRAM_DCID);

async function getPhone() {
  return (await prompts({
    type: 'text',
    name: 'phone',
    message: 'Enter your phone number:'
  })).phone
}

async function getCode() {
  // you can implement your code fetching strategy here
  return (await prompts({
    type: 'text',
    name: 'code',
    message: 'Enter the code sent:',
  })).code
}

async function getPassword() {
  return (await prompts({
    type: 'text',
    name: 'password',
    message: 'Enter Password:',
  })).password
}



const startAuth = async (phone_number) => {
  // The user is not logged in
  console.log('[+] You must log in')
  if (!phone_number) phone_number = await getPhone()

  mtproto.call('auth.sendCode', {
    phone_number: phone_number,
    settings: {
      _: 'codeSettings',
    },
  })
    .catch(error => {
      console.log('SEND CODE ERROR', error);
      if (error.error_message.includes('_MIGRATE_')) {
        const [type, nextDcId] = error.error_message.split('_MIGRATE_');

        mtproto.setDefaultDc(+nextDcId);

        return mtproto.call('auth.sendCode', {
          phone_number: phone_number,
          settings: {
            _: 'codeSettings',
          },
        })
      }
    })
    .then(async result => {
      console.log('Send Code', result)
      return mtproto.call('auth.signIn', {
        phone_code: await getCode(),
        phone_number: phone_number,
        phone_code_hash: result.phone_code_hash,
      });
    })
    .catch(error => {
      console.log('auth.signIn ERROR', error);
      if (error.error_message === 'SESSION_PASSWORD_NEEDED') {
        return mtproto.call('account.getPassword').then(async result => {
          const { srp_id, current_algo, srp_B } = result;
          const { salt1, salt2, g, p } = current_algo;

          const { A, M1 } = await getSRPParams({
            g,
            p,
            salt1,
            salt2,
            gB: srp_B,
            password: await getPassword(),
          });

          return mtproto.call('auth.checkPassword', {
            password: {
              _: 'inputCheckPasswordSRP',
              srp_id,
              A,
              M1,
            },
          });
        });
      }
    })
    .then(result => {
      console.log('[+] successfully authenticated', result);
      // start listener since the user has logged in now
      startListener()
    });
}

const startListener = () => {
  console.log('[+] starting listener')
  mtproto.updates.on('updates', ({ updates }) => {
    const newChannelMessages = updates.filter((update) => update._ === 'updateNewChannelMessage').map(({ message }) => message) // filter `updateNewChannelMessage` types only and extract the 'message' object

    if (newChannelMessages.length == 0) return;
    const message = newChannelMessages[0];
    if (!message) return;

    const { peer_id: { channel_id } = {} } = message;
    if (channel_id != TELEGRAM_CHANNEL_ID) return;

    try {
      processMessage(message);
    } catch (e) {
      log('PROCESSING MESSAGE ERROR', e);
    }
  });
  // bindEvents();
}

const bindEvents = () => {
  mtproto.updates.on('updatesTooLong', (updateInfo) => {
    console.log('updatesTooLong:', logTime(), updateInfo);
  });

  mtproto.updates.on('updateShortMessage', (updateInfo) => {
    console.log('updateShortMessage:', logTime(), updateInfo);
  });

  mtproto.updates.on('updateShortChatMessage', (updateInfo) => {
    console.log('updateShortChatMessage:', logTime(), updateInfo);
  });

  // mtproto.updates.on('updateShort', (updateInfo) => {
  //   console.log('updateShort:', logTime(), updateInfo);
  // });

  mtproto.updates.on('updatesCombined', (updateInfo) => {
    console.log('updatesCombined:', logTime(), updateInfo);
  });

  // mtproto.updates.on('updates', (updateInfo) => {
  //   console.log('updates:', logTime(), updateInfo);
  // });

  mtproto.updates.on('updateShortSentMessage', (updateInfo) => {
    console.log('updateShortSentMessage:', logTime(), updateInfo);
  });
}

const logTime = () => {
  return new Date();
}

const log = (...msg) => {
  console.log(logTime(), ...msg);
}

const strReplace = (str, source, target) => {
  source.forEach(src => str = str.replace(src, target));
  return str;
}

/**
 * Parse coin
 * sample line: COIN: $FIL/USDT (3-5x)
 * sample return: { coin: 'FIL/USDT', leverage: [3, 5] }
 * @param {String} line 
 * @returns 
 */
const parseCoin = (line) => {
  const msgs = line.split(' ');
  if (msgs[0] != 'COIN:') return null;
  const coin = msgs[1].replace('$', '');
  const leverage = splitValues(strReplace(msgs[2], ['(', 'x', ')'], ''));
  return {
    coin,
    leverage
  }
}

const findLine = (lines, key) => {
  for (let line of lines) {
    if (line.indexOf(key) == 0)
      return line.replace(key, '').trim();
  }
  return null;
}

/**
 * Parse Entry
 * sample input: ENTRY: 81 - 84.5
 * sample output: [81, 84.5]
 * @param {String} lines 
 * @returns 
 */
const parseEntry = (lines) => {
  const value = findLine(lines, 'ENTRY:');
  if (!value) throw 'ENTRY NOT FOUND';
  const values = value.split('-');
  return values.map(v => parseFloat(v));
}

const parseOTE = (lines) => {
  const value = findLine(lines, 'OTE:');
  if (!value) throw 'OTE NOT FOUND';
  return parseFloat(value);
}

const parseStopLoss = (lines) => {
  const value = findLine(lines, 'STOP LOSS:');
  if (!value) throw 'STOP LOSS NOT FOUND';
  return parseFloat(value);
}

const splitValues = (values) => {
  if (!values) return [];
  return values.split('-').map(v => (parseFloat(v.trim())));
}

const parseTerms = (lines) => {
  const short = findLine(lines, 'Short Term:');
  const mid = findLine(lines, 'Mid Term:');
  const long = findLine(lines, 'Long Term:');
  return {
    short: splitValues(short),
    mid: splitValues(mid),
    long: splitValues(long)
  };
}

const processMessage = (message) => {
  const { reply_to = null, message: msgContent, date } = message;
  if (reply_to) return;

  const msgLines = msgContent.split('\n');
  if (msgLines[0].indexOf('SIGNAL ID:') == -1) return;

  // New signal is incomed.
  [0, 1, 2].forEach(index => log(msgLines[index]));

  const { coin, leverage } = parseCoin(msgLines[1]);
  const entry = parseEntry(msgLines);
  const ote = parseOTE(msgLines);
  const terms = parseTerms(msgLines);
  const stopLoss = parseStopLoss(msgLines);

  const signalData = {
    coin,
    leverage,
    entry,
    ote,
    terms,
    stopLoss
  };

  return signalData;
}

const startTG = () => {
  // checking authentication status
  mtproto
    .call('users.getFullUser', {
      id: {
        _: 'inputUserSelf',
      },
    })
    .then(startListener) // means the user is logged in -> so start the listener
    .catch(async error => {
      console.log('Error, error', error)
      startAuth()
    });
}

exports.startTG = startTG;
