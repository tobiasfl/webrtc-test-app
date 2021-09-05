const express = require('express');
const path = require('path');

const app = express();

//added by me
const server = require('http').createServer(app);
const io = require('socket.io')(server);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req,res)=>{
    res.sendFile(path.resolve(__dirname, "public","index.html"));
})


let clientCount = 0;

console.log("initing socket event handlers");

io.on('connection', socket => {
    console.log('new connection');

    socket.on('message', (message, roomId) => {
        socket.to(roomId).emit('message', message);
    })

    socket.on('message2', (message, roomId) => {
        socket.to(roomId).emit('message2', message);
    })

    socket.on('join-room', roomId => {
        console.log('new client joined room' + roomId);

        clientCount++;
        if (clientCount == 1) {
            console.log('creating room');

            socket.join(roomId);
            socket.emit('created', roomId);
        } 
        else if (clientCount == 2) {
            console.log('2nd client joined');

            socket.to(roomId).emit('join', roomId);
            socket.join(roomId);
            socket.emit('joined', roomId);
        }
        else {
            console.log('Rejected a client, room full');

            socket.emit('full');
        }
    })
    socket.on('disconnect', () => {
        clientCount--;
        console.log(`a user disconnected, user remaining: ${clientCount}`);
    });
})




module.exports = server;