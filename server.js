// server.js - VERSIÓN CORREGIDA
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
let drawingHistory = []; // Array para guardar TODOS los trazos
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

  // IMPORTANTE: Enviar historial completo al nuevo usuario
  socket.emit('user-data', userData);
  
  // Enviar historial de dibujo inmediatamente
  if (drawingHistory.length > 0) {
    console.log(`Enviando ${drawingHistory.length} trazos de historial a ${userName}`);
    socket.emit('drawing-history', drawingHistory);
  }
  
  // Notificar a todos sobre el nuevo usuario
  io.emit('users-update', Array.from(connectedUsers.values()));
  socket.broadcast.emit('user-joined', { user: userData.name, color: userData.color });

  // Manejar eventos de dibujo
  socket.on('start-drawing', (data) => {
    userData.isDrawing = true;
    userData.currentStroke = {
      tool: data.tool,
      color: data.color,
      size: data.size,
      points: [{ x: data.x, y: data.y }],
      userId: socket.id,
      userName: userData.name,
      userColor: userData.color,
      timestamp: Date.now()
    };
    
    connectedUsers.set(socket.id, userData);
    
    socket.broadcast.emit('user-start-drawing', {
      ...data,
      userId: socket.id,
      userName: userData.name,
      userColor: userData.color
    });
  });

  socket.on('drawing', (data) => {
    if (userData.isDrawing && userData.currentStroke) {
      // Agregar punto al trazo actual
      userData.currentStroke.points.push({ x: data.x, y: data.y });
      
      // Enviar SOLO las coordenadas actuales y anteriores
      const points = userData.currentStroke.points;
      const currentIndex = points.length - 1;
      const prevIndex = currentIndex - 1;
      
      if (prevIndex >= 0) {
        socket.broadcast.emit('user-drawing', {
          tool: data.tool,
          color: data.color,
          size: data.size,
          // Enviar punto anterior y actual para línea continua
          fromX: points[prevIndex].x,
          fromY: points[prevIndex].y,
          x: data.x,
          y: data.y,
          userId: socket.id,
          userName: userData.name,
          userColor: userData.color,
          timestamp: Date.now()
        });
      }
    }
  });

  socket.on('stop-drawing', (data) => {
    if (userData.isDrawing && userData.currentStroke) {
      userData.isDrawing = false;
      
      // GUARDAR el trazo completo en el historial
      drawingHistory.push(userData.currentStroke);
      
      // Limitar historial para evitar uso excesivo de memoria
      if (drawingHistory.length > 500) {
        drawingHistory = drawingHistory.slice(-500);
      }
      
      console.log(`Trazo guardado. Historial tiene ${drawingHistory.length} trazos`);
      
      userData.currentStroke = null;
      connectedUsers.set(socket.id, userData);
      
      socket.broadcast.emit('user-stop-drawing', {
        ...data,
        userId: socket.id,
        userName: userData.name,
        userColor: userData.color
      });
    }
  });

  // Manejar movimiento del cursor
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

  // Limpiar pizarra
  socket.on('clear-canvas', () => {
    drawingHistory = []; // Limpiar historial completamente
    console.log('Canvas limpiado. Historial reiniciado.');
    
    io.emit('canvas-cleared', { 
      clearedBy: userData.name,
      timestamp: Date.now() 
    });
  });

  // Manejar desconexión
  socket.on('disconnect', () => {
    console.log('Usuario desconectado:', socket.id);
    
    const disconnectedUser = connectedUsers.get(socket.id);
    connectedUsers.delete(socket.id);
    
    if (disconnectedUser) {
      socket.broadcast.emit('user-left', { 
        user: disconnectedUser.name, 
        color: disconnectedUser.color 
      });
      io.emit('users-update', Array.from(connectedUsers.values()));
    }
  });

  // Manejar errores
  socket.on('error', (error) => {
    console.log('Error de socket:', error);
  });
});

// Endpoint para obtener estadísticas
app.get('/api/stats', (req, res) => {
  res.json({
    connectedUsers: connectedUsers.size,
    drawingStrokes: drawingHistory.length,
    uptime: process.uptime()
  });
});

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
  console.log(`📊 Estadísticas: ${PORT}/api/stats`);
});