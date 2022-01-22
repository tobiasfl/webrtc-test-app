const express = require('express');
const path = require('path');
const app = express();
const https = require('https');
const fs = require('fs');

const options = {
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem')
};

const server = https.createServer(options, app);

const io = require('socket.io')(server);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req,res)=>{
    res.sendFile(path.resolve(__dirname, "public","index.html"));
})



console.log("initing socket event handlers");

io.on('connection', socket => {
    console.log('new connection');
    console.log('total sockets connected: ' +  io.of("/").sockets.size);

    socket.on('message', (message, roomId) => {
        socket.to(roomId).emit('message', message);
    })

    socket.on('join-room', roomId => {
        console.log('new client joined room ' + roomId);

        io.in(roomId).fetchSockets()
            .then(sockets => {
                const clientCount = sockets.length;
                if (clientCount == 0) {
                    console.log('creating room');

                    socket.join(roomId);
                    socket.emit('created', roomId);
                } 
                else if (clientCount == 1) {
                    console.log('2nd client joined');

                    socket.to(roomId).emit('join', roomId);

                    socket.join(roomId);
                    socket.emit('joined', roomId);
                }
                else {
                    console.log('Rejected a client, room full');

                    socket.emit('full');
                }
            });
    })
    socket.on('disconnect', () => {
        console.log(`a user disconnected, total sockets remaining: ${io.of("/").sockets.size}`);
    });
})




module.exports = server;