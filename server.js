const path = require('path');
const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');
const binance = require('node-binance-api');
const socketIO = require('socket.io');
const cron = require('node-cron');

const eliotOrders = require('./src/initialize.js');

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

io.on('connection', socket => {
  socket.on('user_connected', data => {
    // Get active eliot orders
    eliotOrders.findActiveOrdersByAPIKEY(data.apiKey).then(data => {
      socket.emit('active_orders', data);
    }).catch(e => {
      console.log(e);
    })
  });
  socket.on('trailing_buy', data => {});

  socket.on('trailing_sell', data => {
    if (data.preBuy) {
      eliotOrders.preOrder(data);
    } else {
      eliotOrders.newOrder(data);
    }
  });

  socket.on('cancel_order', data => {
    console.log(data);
    eliotOrders.cancelOrder(data);
  })

  socket.on('disconnect', () => {
    console.log('Disconnected from server');
  });
});

// start server on specified port
server.listen(port, () => {
  console.log(`Server is up on port ${port}`);
});

module.exports = { app };
