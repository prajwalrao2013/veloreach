const { io } = require('socket.io-client');
const socket = io('http://localhost:5000');
socket.on('connect', () => {
    console.log('Connected to backend, dispatching test campaign...');
    socket.emit('launch_campaign', {
        leads: [{ contact: '919741623190', name: 'Belpu Prajwal Rao' }],
        template: 'hi',
        useAi: false,
        attachment: { type: 'none' },
        batchSize: 25,
        pauseMinutes: 30,
        startHour: 0,
        endHour: 24
    });
    
    socket.on('campaign_state', (state) => {
        console.log('Campaign State:', state);
        if (state.status === 'Completed' || state.sent > 0) {
            console.log('Message dispatched successfully!');
            setTimeout(() => { process.exit(0); }, 1000);
        }
    });
    
    setTimeout(() => { 
        console.log('Timeout reached');
        process.exit(0); 
    }, 15000);
});
