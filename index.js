const path = require('path');
const MTProto = require('@mtproto/core');
const prompts = require('prompts');
require('dotenv').config()

const dcId = 1;

const {
  TELEGRAM_API_ID,
  TELEGRAM_API_HASH,
  PHONE_NUMBER
} = process.env;

// 1. Create instance
const mtproto = new MTProto({
  api_id: TELEGRAM_API_ID,
  api_hash: TELEGRAM_API_HASH,

  storageOptions: {
    path: path.resolve(__dirname, './data/1.json'),
  },
});

mtproto.setDefaultDc(dcId);

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



const startAuth = async () => {
  // The user is not logged in
  console.log('[+] You must log in')
  const phone_number = PHONE_NUMBER; // await getPhone()

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

        return sendCode(phone_number);
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
  /*mtproto.updates.on('updates', ({ updates }) => {
    console.log('UPDATES', updates);
    const newChannelMessages = updates.filter((update) => update._ === 'updateNewChannelMessage').map(({ message }) => message) // filter `updateNewChannelMessage` types only and extract the 'message' object

    for (const message of newChannelMessages) {
      // printing new channel messages
      console.log(`[${message.to_id.channel_id}] ${message.message}`)
    }
  });*/
  bindEvents();
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

startTG();

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

  mtproto.updates.on('updateShort', (updateInfo) => {
    console.log('updateShort:', logTime(), updateInfo);
  });

  mtproto.updates.on('updatesCombined', (updateInfo) => {
    console.log('updatesCombined:', logTime(), updateInfo);
  });

  mtproto.updates.on('updates', (updateInfo) => {
    console.log('updates:', logTime(), updateInfo);
  });

  mtproto.updates.on('updateShortSentMessage', (updateInfo) => {
    console.log('updateShortSentMessage:', logTime(), updateInfo);
  });
}

const logTime = () => {
  return new Date();
}