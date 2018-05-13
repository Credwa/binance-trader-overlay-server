const Binance = require("binance-api-node").default;
const binance = require("node-binance-api");
const EventEmitter = require("events");
const sgMail = require("@sendgrid/mail");

const cron = require("node-cron");
const db = require("../db/firebase-setup.js");

class MyEmitter extends EventEmitter {}
const myEmitter = new MyEmitter();
let currSymbolPrice = {};
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Socket for all symbol prices for comparison
binance.websockets.prevDay(false, (error, response) => {
  currSymbolPrice[response.symbol] = response.bestBid;
});

let sendMail = (to, subject, html) => {
  if (!to) {
    return;
  }
  let msg = {
    to: to,
    from: "do-not-reply@eliot.orders.com",
    subject: subject,
    text: "text",
    html: html
  };

  sgMail
    .send(msg)
    .then(data => {
      let temp = data;
    })
    .catch(e => {
      console.log(e);
    });
};

// Find all active orders by apikey and secret
let findActiveOrdersByAPIKEY = (apiKey, secret) => {
  return new Promise((resolve, reject) => {
    db.refTrail
      .orderByChild("APIKEY")
      .equalTo(apiKey)
      .once("value", data => {
        resolve(data.val());
      })
      .then(res => {
        console.log();
      })
      .catch(e => {
        reject("No active orders");
      });
  });
};

// Set tracking upon new order
let trackOrder = order => {
  let dbOrder = null;
  cron.schedule(`*/3 * * * * *`, () => {
    db.refTrail
      .orderByChild("key")
      .equalTo(order.key)
      .once("value", data => {
        if (data.val()) {
          let dbOrder = data.val();
          let updatedOrder = dbOrder[Object.keys(dbOrder)[0]];
          let newPrice = currSymbolPrice[order.symbol + "BTC"];
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
      })
      .catch(e => {
        console.log(e);
      });
  });
};

// sell and cancel order upon stop price reached
let stopPriceReached = data => {
  const newClient = new Binance({
    apiKey: data.APIKEY,
    apiSecret: data.APISECRET
  });
  // cancel order
  cancelOrder(data);

  // sell
  if (!data.test) {
    newClient
      .order({
        symbol: data.symbol + "BTC",
        side: "SELL",
        quantity: data.amount,
        type: "MARKET"
      })
      .then(res => {
        let temp = res;
      })
      .catch(e => {
        console.log(e);
      });
  }
};

// Adjust order when specified trail increases
let trailIncreased = (order, newPrice) => {
  let initialPrice = newPrice;
  let trailingStopPrice = (newPrice * (1 - order.trail / 100)).toFixed(8);
  db.refTrail
    .orderByChild("key")
    .equalTo(order.key)
    .once("value", data => {
      if (data) {
        let keyToUpdate = Object.keys(data.val());
        if (keyToUpdate.length > 0) {
          db.refTrail
            .child(keyToUpdate[0])
            .update({
              trailingSellStopPrice: trailingStopPrice,
              initialPrice: newPrice
            })
            .catch(e => {
              console.log(e);
            });
        }
        sendMail(
          order.email,
          `${data.test ? "Test" : ""} Eliot Order Placed On ${
            order.symbol
          } has made some gains :D`,
          `<h4>Amount: ${order.amount}</h4>
        </br>
        <h4>New Price: ${initialPrice}</h4>
        </br>
        <h4>Trail Percentage: ${order.trail}%</h4>
        </br>
        <h4>New Trail Stop Price: ${trailingStopPrice}</h4>
        </br>
        <h4>Gain % Protection: ${order.gainProtection}</h4>
        `
        );
      }
    })
    .catch(e => {
      console.log(e);
    });
};

let cancelOrder = pData => {
  db.refTrail
    .orderByChild("key")
    .equalTo(pData.key)
    .once("value", data => {
      if (data) {
        let keyToDelete = Object.keys(data.val());
        if (keyToDelete.length > 0) {
          db.refTrail
            .child(keyToDelete[0])
            .remove()
            .catch(e => {
              console.log(e);
            });
        }
        sendMail(
          pData.email,
          `${data.test ? "Test" : ""} Eliot Order Placed On ${
            pData.symbol
          } has dropped to latest trail stop price :(`,
          `<h4>Amount: ${pData.amount}</h4>
        </br>
        <h4>Last Price: ${pData.initialPrice}</h4>
        <h4>First Price: ${pData.start.firstPrice}</h4>
        </br>
        <h4>Trail Percentage: ${pData.trail}%</h4>
        </br>
        <h4>Last Trail Stop Price: ${pData.trailingSellStopPrice}</h4>
        </br>
        <h4>Gain % Protection: ${pData.gainProtection}</h4>
        `
        );
      }
    })
    .catch(e => {
      console.log(e);
    });
};

// handles preorders. Buys then waits for completion then tracks
let preOrder = data => {
  const newClient = new Binance({
    apiKey: data.APIKEY,
    apiSecret: data.APISECRET
  });

  let clean = null;

  if (data.preBuy.price > 0) {
    // limit order
    newClient
      .order({
        symbol: data.symbol + "BTC",
        side: "BUY",
        quantity: data.preBuy.amount,
        price: data.preBuy.price
      })
      .then(info => {
        let orderId = info.clientOrderId;
        clean = newClient.ws.user(msg => {
          if (
            msg.eventType === "executionReport" &&
            msg.orderStatus === "FILLED"
          ) {
            if (msg.newClientOrderId === orderId) {
              // pass optional parameter to clean websocket
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
        symbol: data.symbol + "BTC",
        side: "BUY",
        quantity: data.preBuy.amount,
        type: "MARKET"
      })
      .then(info => {
        let orderId = info.clientOrderId;
        clean = newClient.ws.user(msg => {
          if (
            msg.eventType === "executionReport" &&
            msg.orderStatus === "FILLED"
          ) {
            if (msg.newClientOrderId === orderId) {
              // pass optional parameter to clean websocket
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
  sendMail(
    data.email,
    `New ${data.test ? "Test" : ""} Eliot Order Placed On ${data.symbol}`,
    `<h4>Amount: ${data.amount}</h4>
  </br>
  <h4>Initial Price: ${data.initialPrice}</h4>
  </br>
  <h4>Trail Percentage: ${data.trail}%</h4>
  </br>
  <h4>Current Trail Stop Price: ${data.trailingSellStopPrice}</h4>
  </br>
  <h4>Gain % Protection: ${data.gainProtection}</h4>
  `
  );
};

// starts tracking for all orders in database on backend start
// useful for when doing updates and backend restarts
let init = () => {
  db.refTrail
    .once("value", data => {
      let myData = data.val();
      if (myData) {
        Object.keys(myData).forEach(val => {
          trackOrder(myData[val]);
        });
      }
    })
    .then(res => {
      console.log();
    })
    .catch(e => {
      console.log(e);
    });
};

module.exports = {
  newOrder,
  preOrder,
  init,
  findActiveOrdersByAPIKEY,
  cancelOrder
};
