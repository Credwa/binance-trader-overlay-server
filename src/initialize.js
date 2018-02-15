const Binance = require('binance-api-node').default;
const binance = require('node-binance-api');
const cron = require('node-cron');
const db = require('../db/firebase-setup.js');

let currSymbolPrice = {};

binance.websockets.prevDay(false, (error, response) => {
  currSymbolPrice[response.symbol] = response.bestBid;
});

let findActiveOrders = (apiKey, secret) => {};

let trackOrder = order => {
  let dbOrder = null;
  cron.schedule(`*/3 * * * * *`, () => {
    db.refTrail
      .orderByChild('key')
      .equalTo(order.key)
      .once('value', data => {
        if (data) {
          let dbOrder = data.val();
          let updatedOrder= dbOrder[Object.keys(dbOrder)[0]];
          let newPrice = currSymbolPrice[order.symbol + 'BTC'];
          let percentIncrease = (
            (newPrice - updatedOrder.initialPrice) /
            updatedOrder.initialPrice *
            100
          ).toFixed(5);
          if (newPrice <= updatedOrder.trailingSellStopPrice) {
            stopPriceReached(updatedOrder);
          } else if (percentIncrease >= updatedOrder.trail) {
            trailIncreased(updatedOrder, newPrice);
          }
        }
      });
  });
};

let stopPriceReached = data => {
  const newClient = new Binance({
    apiKey: data.APIKEY,
    apiSecret: data.APISECRET
  });
  // cancel order
  cancelOrder(data);

  // sell
  newClient
    .order({
      symbol: data.symbol + 'BTC',
      side: 'SELL',
      quantity: data.amount,
      type: 'MARKET'
    })
    .then(res => {
      console.log(res);
    })
    .catch(e => {
      console.log(e);
    });
};

let trailIncreased = (order, newPrice) => {
  let initialPrice = newPrice;
  let trailingStopPrice = (newPrice * (1 - order.trail / 100)).toFixed(8);
  db.refTrail
    .orderByChild('key')
    .equalTo(order.key)
    .once('value', data => {
      if (data) {
        let keyToUpdate = Object.keys(data.val());
        if (keyToUpdate.length > 0) {
          db.refTrail.child(keyToUpdate[0]).update({
            "trailingSellStopPrice": trailingStopPrice,
            "initialPrice": newPrice
          });
        }
      }
    });
};

let cancelOrder = pData => {
  db.refTrail
    .orderByChild('key')
    .equalTo(pData.key)
    .once('value', data => {
      if (data) {
        let keyToDelete = Object.keys(data.val());
        if (keyToDelete.length > 0) {
          db.refTrail.child(keyToDelete[0]).remove();
        }
      }
    });
};

let newOrder = data => {
  let newRef = db.refKeys.push();
  let postData = {
    ...data,
    key: newRef.getKey()
  };
  trackOrder(postData);
  db.refTrail.push(postData);
};

module.exports = { findActiveOrders, newOrder };
