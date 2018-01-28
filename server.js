const path = require('path');
const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');
const binance = require('node-binance-api');
const socketIO = require('socket.io');
const cron = require('node-cron');

const port = process.env.PORT || 3000;
let app = express();
let server = http.createServer(app);
let io = socketIO(server);

// app.use((req, res, next) => {
//   res.header('Access-Control-Allow-Origin', '*');
//   res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,PATCH,DELETE');
//   res.header(
//     'Access-Control-Allow-Headers',
//     'Origin, X-Requested-With, Content-Type, Accept'
//   );
//   next();
// });

let priceUpdates = {};

binance.websockets.prevDay(false, (error, response) => {
  priceUpdates[response.symbol] = response.bestBid;
});

io.on('connection', socket => {
  console.log('New user connected');

  socket.on('trailing_buy', data => {});

  socket.on('trailing_sell', data => {
    console.log(data);
    let userBinance = binance;
    // Stop Price and initial Price are recalculated if current Price reaches the trailing % more than initial price
    let trailingStopPrice = data.trailingSellStopPrice;
    let initialPrice = data.initialPrice;
    let trail = data.trail;
    let symbol = data.symbol;
    let orderId = data.orderId;
    let amount = data.amount;

    userBinance.options({
      APIKEY: data.APIKEY,
      APISECRET: data.APISECRET,
      useServerTime: true
    });
    cron.schedule('*/15 * * * * *', () => {
      let newPrice = priceUpdates[symbol];
      let percentIncrease = (
        (newPrice - initialPrice) /
        initialPrice *
        100
      ).toFixed(5);
      if (newPrice <= trailingStopPrice) {
        // cancel temp order
        userBinance.cancel(symbol, orderId, (error, response, symbol) => {
          //
          if (error) {
            // error handling
          } else {
            // sell when drop to stop price
            userBinance.marketSell(symbol, amount, resp => {});
          }
        });
      }
      if (percentIncrease >= trail) {
        // recalculate stop and initail using trail

        initialPrice = newPrice;
        trailingStopPrice =
          initialPrice * (1 - this.trailingSellPercentage / 100).toFixed(8);
        socket.emit('stopPriceIncreased', { trail, trailingStopPrice, basePrice: initialPrice });
      }
    });
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from server');
  });
});

// start server on specified port
server.listen(port, () => {
  console.log(`Server is up on port ${port}`);
});

module.exports = { app };
