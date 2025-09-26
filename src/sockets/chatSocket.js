// chatSocket.js
let ioRef = null;

function initChatSocket(io) {
  ioRef = io;
  const nsp = io.of('/chat'); // namespace dedicado

  nsp.on('connection', (socket) => {
    // cliente chama join com { conversationId }
    socket.on('join', ({ conversationId }) => {
      if (!conversationId) return;
      socket.join(`conversation:${conversationId}`);
    });
    // opcional: leave
    socket.on('leave', ({ conversationId }) => {
      if (!conversationId) return;
      socket.leave(`conversation:${conversationId}`);
    });
  });
}

function emitNewMessage(conversationId, message) {
  if (!ioRef) return;
  ioRef.of('/chat').to(`conversation:${conversationId}`).emit('message:new', message);
}

function emitRead(conversationId, payload) {
  if (!ioRef) return;
  ioRef.of('/chat').to(`conversation:${conversationId}`).emit('message:read', payload);
}

module.exports = { initChatSocket, emitNewMessage, emitRead };
