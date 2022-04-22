const express = require('express');
const path = require('path');
const app = express();
const https = require('https');
const fs = require('fs');
const { type } = require('express/lib/response');

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

    socket.on('serverMessage', (message, roomId) => {
        if (message.videoStats && message.videoStats.length > 0) {
            fs.writeFile(roomId+'video_stats.txt', convertToCsv(message.videoStats), function (err, data) {
                if (err) {
                    return console.log(err);
                }
            });
        }
        if (message.dcStats && message.dcStats.length > 0) {
            fs.writeFile(roomId+'data_channel_stats.txt', convertToCsv(message.dcStats), function (err, data) {
                if (err) {
                    return console.log(err);
                }
            });
        }
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
    socket.on('disconnecting', () => {
        // First element is socketId, so assume it was only part
        // of the roomId on the last index
        roomId = socket.rooms.forEach(roomId => {
            io.to(roomId).emit('left');
        });
    });
    socket.on('disconnect', () => {
        console.log(`a user disconnected, total sockets remaining: ${io.of("/").sockets.size}`);
    });
})

const convertToCsv = (arr) => {
    const array = [Object.keys(arr[0])].concat(arr);

    return array.map(it => {
        return Object.values(it).toString()
    }).join('\n');
}




module.exports = server;