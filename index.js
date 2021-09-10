const path = require('path');
const MTProto = require('@mtproto/core');
require('dotenv').config()

const {
  TELEGRAM_API_ID,
  TELEGRAM_API_HASH
} = process.env;

// 1. Create instance
const mtproto = new MTProto({
  api_id: TELEGRAM_API_ID,
  api_hash: TELEGRAM_API_HASH,

  storageOptions: {
    path: path.resolve(__dirname, './data/1.json'),
  },
});

// 2. Print the user country code
mtproto.call('help.getNearestDc').then(result => {
  console.log('country:', result.country);
});
