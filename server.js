/** @format */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://js.paystack.co', "'nonce-random123'"],
        frameSrc: ['https://checkout.paystack.com'],
      },
    },
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// app.use((req, res, next) => {
//   res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
//   next();
// });

// Paystack configuration
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

if (!PAYSTACK_SECRET_KEY) {
  console.error('PAYSTACK_SECRET_KEY is required');
  process.exit(1);
}

// API 1: Initialize Transaction
app.post('/api/initialize-payment', async (req, res) => {
  try {
    const { email, amount, currency = 'NGN', reference } = req.body;

    if (!email || !amount) {
      return res.status(400).json({
        status: false,
        message: 'Email and amount are required',
      });
    }

    const paymentData = {
      email,
      amount: amount * 100, // Convert to kobo
      currency,
      reference:
        reference ||
        `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      callback_url: `${req.protocol}://${req.get('host')}/payment-callback`,
    };

    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      paymentData,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    res.json({
      status: true,
      data: response.data.data,
    });
  } catch (error) {
    console.error(
      'Initialize payment error:',
      error.response?.data || error.message
    );
    res.status(500).json({
      status: false,
      message: 'Failed to initialize payment',
      error: error.response?.data?.message || error.message,
    });
  }
});

// API 2: Verify Transaction
app.get('/api/verify-payment/:reference', async (req, res) => {
  try {
    const { reference } = req.params;

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    res.json({
      status: true,
      data: response.data.data,
    });
  } catch (error) {
    console.error(
      'Verify payment error:',
      error.response?.data || error.message
    );
    res.status(500).json({
      status: false,
      message: 'Failed to verify payment',
      error: error.response?.data?.message || error.message,
    });
  }
});

// API 3: Get All Transactions
app.get('/api/transactions', async (req, res) => {
  try {
    const { page = 1, perPage = 10 } = req.query;

    const response = await axios.get(
      `https://api.paystack.co/transaction?page=${page}&perPage=${perPage}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    res.json({
      status: true,
      data: response.data.data,
      meta: response.data.meta,
    });
  } catch (error) {
    console.error(
      'Get transactions error:',
      error.response?.data || error.message
    );
    res.status(500).json({
      status: false,
      message: 'Failed to fetch transactions',
      error: error.response?.data?.message || error.message,
    });
  }
});

// Webhook endpoint for Paystack
app.post('/api/webhook', (req, res) => {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const hash = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (hash === req.headers['x-paystack-signature']) {
    const event = req.body;

    switch (event.event) {
      case 'charge.success':
        console.log('Payment successful:', event.data);
        // Handle successful payment
        break;
      case 'charge.failed':
        console.log('Payment failed:', event.data);
        // Handle failed payment
        break;
      default:
        console.log('Unhandled event:', event.event);
    }

    res.status(200).send('Webhook received');
  } else {
    res.status(400).send('Invalid signature');
  }
});

// Payment callback route
app.get('/payment-callback', (req, res) => {
  const { reference, trxref } = req.query;
  res.redirect(`/?reference=${reference || trxref}&status=success`);
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Frontend available at: http://localhost:${PORT}`);
});

module.exports = app;
