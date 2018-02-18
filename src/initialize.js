const Binance = require('binance-api-node').default;
const binance = require('node-binance-api');
const EventEmitter = require('events');

const cron = require('node-cron');
const db = require('../db/firebase-setup.js');

class MyEmitter extends EventEmitter {}
const myEmitter = new MyEmitter();
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
          let updatedOrder = dbOrder[Object.keys(dbOrder)[0]];
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
            trailingSellStopPrice: trailingStopPrice,
            initialPrice: newPrice
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

let preOrder = data => {
  // handles preorders. Buys then waits for completion then tracks
  const newClient = new Binance({
    apiKey: data.APIKEY,
    apiSecret: data.APISECRET
  });

  let clean = null;

  if (data.preBuy.price > 0) {
    // limit order
    newClient
      .order({
        symbol: data.symbol + 'BTC',
        side: 'BUY',
        quantity: data.preBuy.amount,
        price: data.preBuy.price
      })
      .then(info => {
        let orderId = info.clientOrderId;
        clean = newClient.ws.user(msg => {
          if (
            msg.eventType === 'executionReport' &&
            msg.orderStatus === 'FILLED'
          ) {
            if (msg.newClientOrderId === orderId) {
              // pass optional parameter to clean websocket
              console.log('creating new order after limit buy');
              newOrder(data, clean);
              // myEmitter.emit('closeSocket', clean);
            }
          }
        });
      })
      .catch(e => {
        console.log(e);
      });
  } else {
    // market order
    newClient
      .order({
        symbol: data.symbol + 'BTC',
        side: 'BUY',
        quantity: data.preBuy.amount,
        type: 'MARKET'
      })
      .then(info => {
        let orderId = info.clientOrderId;
        clean = newClient.ws.user(msg => {
          if (
            msg.eventType === 'executionReport' &&
            msg.orderStatus === 'FILLED'
          ) {
            if (msg.newClientOrderId === orderId) {
              // pass optional parameter to clean websocket
              console.log('creating new order after market buy');
              newOrder(data, clean);
              // myEmitter.emit('closeSocket', clean);
            }
          }
        });
      })
      .catch(e => {
        console.log(e);
      });
  }
};

let newOrder = (data, socketToClean = null) => {
  if (socketToClean) {
    // clean user socket optional parameter for pre buys
    socketToClean
      .then(clean => {
        clean();
      })
      .catch(e => {
        console.log(e);
      });
  }
  let newRef = db.refKeys.push();
  let postData = {
    ...data,
    key: newRef.getKey()
  };
  trackOrder(postData);
  db.refTrail.push(postData);
};

let init = () => {
  // starts tracking for all orders in database on backend start
  // useful for when doing updates and backend restarts
};

module.exports = { findActiveOrders, newOrder, preOrder, init };
