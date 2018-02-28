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

eliotOrders.init();

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
      if (data.test) {
        let tempData = data;
        tempData.amount = data.preBuy.amount;
        eliotOrders.newOrder(tempData);
      } else {
        eliotOrders.preOrder(data);
      }
    } else {
      eliotOrders.newOrder(data);
    }
  });

  socket.on('cancel_order', data => {
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

app.get('/', (req, res) => {
  res.send('Welcome!\n');
})

module.exports = { app };
