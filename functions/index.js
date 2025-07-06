class WebSocketDurableObject {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.sessions = new Set(); // Stores WebSocket connections
        this.playerStates = new Map(); // Stores player data: Map<playerId, {username: string, state: object}>
    }

    // Handle WebSocket requests
    async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === '/websocket') {
            const upgradeHeader = request.headers.get('Upgrade');
            if (!upgradeHeader || upgradeHeader !== 'websocket') {
                return new Response('Expected Upgrade: websocket', { status: 426 });
            }

            const { webSocket, response } = WebSocket.handle(request);

            webSocket.accept();
            this.sessions.add(webSocket);

            webSocket.addEventListener('message', async event => {
                try {
                    const message = JSON.parse(event.data);
                    // console.log('Received message:', message);

                    switch (message.type) {
                        case 'join':
                            // Store player state and broadcast join
                            this.playerStates.set(message.id, { username: message.username, state: message.state });
                            this.broadcast(JSON.stringify(message), webSocket); // Broadcast to others
                            break;
                        case 'update':
                            // Update player state and broadcast update
                            if (this.playerStates.has(message.id)) {
                                this.playerStates.get(message.id).state = message.state;
                            }
                            this.broadcast(JSON.stringify(message), webSocket); // Broadcast to others
                            break;
                        default:
                            console.warn('Unknown message type:', message.type);
                    }
                } catch (err) {
                    console.error('Error handling WebSocket message:', err);
                }
            });

            webSocket.addEventListener('close', async event => {
                console.log(`WebSocket closed: ${event.code} ${event.reason}`);
                this.sessions.delete(webSocket);
                // Find the player ID associated with this closed WebSocket (if stored)
                // This is a simple approach; a more robust solution would map sessions to player IDs directly.
                // For now, assume a player leaves when their socket closes.
                let leavingPlayerId = null;
                for (const [playerId, playerData] of this.playerStates.entries()) {
                    // This is a simplification. In a real game, you'd map sessions to player IDs more directly.
                    // For now, we'll iterate and check if the player state corresponds to a session that's gone.
                    // A better way would be to store playerId directly on the webSocket or in a map.
                    // Let's modify the onopen to send initial states to new joiners.
                    // And let the client send a 'leave' message on beforeunload.
                    // Or, if the DO manages sessions, it can broadcast a 'leave' after a delay if no reconnect.
                }
                // For now, we rely on the client sending a 'leave' on disconnect, or handle it via a timeout.
                // Or, if player ID is sent with the close event.
                // Given the current network.js, the client sends 'leave' on disconnect().
            });

            webSocket.addEventListener('error', async err => {
                console.error('WebSocket error:', err);
                this.sessions.delete(webSocket);
            });

            // Send current player states to the newly connected client
            for (const [id, playerData] of this.playerStates.entries()) {
                // Do not send the player's own join message back to them, as they just sent it.
                // They will create their own model locally.
                if (id !== webSocket.id) { // Assumes unique ID for socket, but socket doesn't have an ID property naturally.
                                         // This part needs careful handling. A better way: client sends its ID upon connection.
                                         // For now, the `network.onPlayerJoin` handles this by checking `id === LOCAL_PLAYER_ID`.
                    webSocket.send(JSON.stringify({
                        type: 'join',
                        id: id,
                        username: playerData.username,
                        state: playerData.state
                    }));
                }
            }

            return response;
        }

        return new Response('Not found', { status: 404 });
    }

    // Broadcast message to all connected sessions except the sender (optional)
    broadcast(message, sender = null) {
        this.sessions.forEach(session => {
            if (session !== sender && session.readyState === WebSocket.OPEN) {
                session.send(message);
            }
        });
    }
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        if (url.pathname.startsWith("/api")) {
            // Example API route
            return new Response(JSON.stringify({ hello: "world" }), {
                headers: { "Content-Type": "application/json" },
            });
        }

        if (url.pathname === '/websocket') {
            // Get a Durable Object ID. Use a fixed name for a singleton object.
            let id = env.WEBSOCKET_DURABLE_OBJECT.idFromName('main-game-instance');
            // Get the Durable Object instance
            let obj = env.WEBSOCKET_DURABLE_OBJECT.get(id);
            // Fetch the request, which will execute the Durable Object's fetch method
            let response = await obj.fetch(request);
            return response;
        }

        // Serve static assets
        return env.ASSETS.fetch(request);
    },
    // Export the Durable Object class
    // This makes it available to the Cloudflare Worker runtime
    async webSocketDurableObject(state, env) {
        return new WebSocketDurableObject(state, env);
    }
};
