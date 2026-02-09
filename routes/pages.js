const express = require('express');
const path = require('path');
const router = express.Router();

router.get('/', (req, res) => res.type('html').sendFile(path.join(__dirname, '..', 'views', 'index.html')));
router.get('/contact', (req, res) => res.type('html').sendFile(path.join(__dirname, '..', 'views', 'contact.html')));
router.get('/search', (req, res) => res.type('html').sendFile(path.join(__dirname, '..', 'views', 'search.html')));
router.get('/items', (req, res) => res.type('html').sendFile(path.join(__dirname, '..', 'views', 'items.html')));
router.get('/info', (req, res) => res.type('html').sendFile(path.join(__dirname, '..', 'views', 'info.html')));
router.get('/stats', (req, res) => res.type('html').sendFile(path.join(__dirname, '..', 'views', 'stats.html')));
router.get('/dashboard', (req, res) => res.type('html').sendFile(path.join(__dirname, '..', 'views', 'dashboard.html')));
router.get('/login', (req, res) => res.type('html').sendFile(path.join(__dirname, '..', 'views', 'login.html')));
router.get('/register', (req, res) => res.type('html').sendFile(path.join(__dirname, '..', 'views', 'register.html')));

module.exports = router;
