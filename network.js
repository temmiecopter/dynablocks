// network.js
// This module handles WebSocket communication for multiplayer.

class NetworkManager {
    constructor() {
        this.ws = null;
        this.playerId = null;
        this.username = null;
        this.initialState = null;

        // Callbacks for game logic to subscribe to
        this.onPlayerJoin = (id, username, state) => {};
        this.onPlayerUpdate = (id, state) => {};
        this.onPlayerLeave = (id) => {};
        this.onConnect = () => {};
        this.onDisconnect = () => {};
        this.onError = (error) => {};
    }

    connect(serverUrl, playerId, username, initialState) {
        this.playerId = playerId;
        this.username = username;
        this.initialState = initialState;

        // Use a dynamic server URL based on the current host for Cloudflare deployment
        // Fallback to localhost if window.location.host is not available (e.g., in some test environments)
        const websocketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const dynamicServerUrl = `${websocketProtocol}//${window.location.host}/websocket`;
        
        this.ws = new WebSocket(dynamicServerUrl);

        this.ws.onopen = () => {
            console.log('WebSocket connected.');
            // Send initial player state upon connection
            this.send({
                type: 'join',
                id: this.playerId,
                username: this.username,
                state: this.initialState
            });
            this.onConnect();
        };

        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
        };

        this.ws.onclose = () => {
            console.log('WebSocket disconnected.');
            this.onDisconnect();
            // Inform others that this player is leaving
            this.send({
                type: 'leave',
                id: this.playerId
            });
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.onError(error);
        };
    }

    handleMessage(message) {
        // Ignore messages from self if they are updates (join messages are fine)
        if (message.id === this.playerId && message.type !== 'join') {
            return;
        }

        switch (message.type) {
            case 'join':
                this.onPlayerJoin(message.id, message.username, message.state);
                break;
            case 'update':
                this.onPlayerUpdate(message.id, message.state);
                break;
            case 'leave':
                this.onPlayerLeave(message.id);
                break;
            default:
                console.warn('Unknown message type:', message.type, message);
        }
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        } else {
            console.warn('WebSocket not open. Cannot send data:', data);
        }
    }

    sendPlayerState(state) {
        this.send({
            type: 'update',
            id: this.playerId,
            state: state
        });
    }

    disconnect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
        }
    }
}

export { NetworkManager };
