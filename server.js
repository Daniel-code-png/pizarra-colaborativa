const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Variables para almacenar el estado de la pizarra
let connectedUsers = new Map();
let drawingHistory = [];
let userColors = ['#667eea', '#ff6b6b', '#51cf66', '#ffd43b', '#ff8787', '#69db7c', '#4dabf7'];
let colorIndex = 0;

// Generar nombres aleatorios para usuarios
const generateUserName = () => {
  const adjectives = ['Creativo', 'Artístico', 'Innovador', 'Brillante', 'Genial', 'Talentoso'];
  const nouns = ['Dibujante', 'Artista', 'Diseñador', 'Creador', 'Pintor', 'Ilustrador'];
  const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
  const randomNum = Math.floor(Math.random() * 1000);
  return `${randomAdj}${randomNoun}${randomNum}`;
};

// Conexión de Socket.IO
io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);

  // Asignar datos al usuario
  const userName = generateUserName();
  const userColor = userColors[colorIndex % userColors.length];
  colorIndex++;

  const userData = {
    id: socket.id,
    name: userName,
    color: userColor,
    isDrawing: false,
    cursor: { x: 0, y: 0 }
  };

  connectedUsers.set(socket.id, userData);

  // Enviar datos iniciales
  socket.emit('user-data', userData);
  socket.emit('drawing-history', drawingHistory);
  
  // Notificar a todos sobre el nuevo usuario
  io.emit('users-update', Array.from(connectedUsers.values()));
  io.emit('user-joined', { user: userData.name, color: userData.color });

  // Manejar eventos de dibujo
  socket.on('start-drawing', (data) => {
    userData.isDrawing = true;
    connectedUsers.set(socket.id, userData);
    
    const drawData = {
      ...data,
      userId: socket.id,
      userName: userData.name,
      userColor: userData.color,
      timestamp: Date.now(),
      type: 'start'
    };

    socket.broadcast.emit('user-start-drawing', drawData);
  });

  socket.on('drawing', (data) => {
    if (userData.isDrawing) {
      const drawData = {
        ...data,
        userId: socket.id,
        userName: userData.name,
        userColor: userData.color,
        timestamp: Date.now(),
        type: 'draw'
      };

      if (data.tool !== 'cursor') {
        drawingHistory.push(drawData);
        if (drawingHistory.length > 1000) {
          drawingHistory = drawingHistory.slice(-1000);
        }
      }

      socket.broadcast.emit('user-drawing', drawData);
    }
  });

  socket.on('stop-drawing', (data) => {
    userData.isDrawing = false;
    connectedUsers.set(socket.id, userData);
    
    const drawData = {
      ...data,
      userId: socket.id,
      userName: userData.name,
      userColor: userData.color,
      timestamp: Date.now(),
      type: 'stop'
    };

    socket.broadcast.emit('user-stop-drawing', drawData);
  });

  socket.on('cursor-move', (data) => {
    userData.cursor = { x: data.x, y: data.y };
    connectedUsers.set(socket.id, userData);
    
    socket.broadcast.emit('user-cursor', {
      userId: socket.id,
      userName: userData.name,
      userColor: userData.color,
      x: data.x,
      y: data.y
    });
  });

  socket.on('clear-canvas', () => {
    drawingHistory = [];
    io.emit('canvas-cleared', { 
      clearedBy: userData.name,
      timestamp: Date.now() 
    });
  });

  socket.on('disconnect', () => {
    console.log('Usuario desconectado:', socket.id);
    
    const disconnectedUser = connectedUsers.get(socket.id);
    connectedUsers.delete(socket.id);
    
    if (disconnectedUser) {
      io.emit('user-left', { 
        user: disconnectedUser.name, 
        color: disconnectedUser.color 
      });
      io.emit('users-update', Array.from(connectedUsers.values()));
    }
  });
});

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
});