const WebSocket = require('ws');
const { MongoClient } = require('mongodb');

// Kết nối tới MongoDB
const uri = 'mongodb+srv://vthien562004:vanthien562004@cluster0.cepmq.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0'; // Đổi theo cấu hình MongoDB của bạn
const client = new MongoClient(uri);
let db, messagesCollection;

// Kết nối tới database 'chatApp' và collection 'messages'
async function connectDB() {
    await client.connect();
    db = client.db('websocket');
    messagesCollection = db.collection('messages');
    console.log('ket noi mongodb thanh cong');
}
connectDB();

const wss = new WebSocket.Server({ port: 8080 });

// Lưu trữ tên của các client đã kết nối
const clients = new Map();

wss.on('connection', async (ws) => {
    console.log('ket noi client thanh cong');
    
    ws.on('message', async (data) => {
        const message = JSON.parse(data);

        // #1: Xử lý khi nhận tên người dùng từ client
        if (message.type === 'setName') {
            const nameExists = Array.from(clients.values()).includes(message.name);
            if (nameExists) {
                ws.send(JSON.stringify({ type: 'error', message: 'Username already exists. Please choose a different name.' }));
            } else {
                clients.set(ws, message.name);
                ws.send(JSON.stringify({ type: 'success' }));

                // Truy vấn các tin nhắn đã lưu trong MongoDB của người dùng này
                const pastMessages = await messagesCollection.find({}).toArray();
                
                // Gửi các tin nhắn cũ cho người dùng
                pastMessages.forEach((msg) => {
                    ws.send(JSON.stringify({
                        type: 'chat',
                        sender: msg.sender,
                        message: msg.message
                    }));
                });

                const welcomeMessage = `${message.name} has joined the chat!`;
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'serverMessage', name: message.name, message: welcomeMessage }));
                    }
                });

                // Lưu sự kiện setName vào MongoDB
                await messagesCollection.insertOne({
                    type: 'setName',
                    name: message.name,
                    timestamp: new Date()
                });
            }
        }

        // #3: Xử lý khi người dùng gửi tin nhắn
        if (message.type === 'chat') {
            const senderName = clients.get(ws);
            const chatMessage = message.text;

            // Lưu tin nhắn vào MongoDB
            await messagesCollection.insertOne({
                type: 'chat',
                sender: senderName,
                message: chatMessage,
                timestamp: new Date()
            });

            // Gửi tin nhắn tới các client
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'chat', sender: senderName, message: chatMessage }));
                }
            });
        }
    });

    // Xử lý khi client ngắt kết nối
    ws.on('close', () => {
        const name = clients.get(ws);

        if (name) {
            // #5. Gửi thông báo cho các client khác về việc người dùng rời phòng
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'serverMessage', message: `${name} has left the chat.` }));
                }
            });
            console.log(`${name} disconnected`);
            clients.delete(ws);
        }
    });
});

console.log('WebSocket server is running on ws://localhost:8080');
