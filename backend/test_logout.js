const io = require('socket.io-client');
const socket = io('http://localhost:5000');
socket.on('connect', () => {
    console.log('Connected, sending logout...');
    socket.emit('logout_whatsapp');
});
socket.on('wa_status', (status) => {
    console.log('Received status:', status);
});
setTimeout(() => process.exit(), 5000);
