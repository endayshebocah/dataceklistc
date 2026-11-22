import React from 'react'
import ReactDOM from 'react-dom/client'
import SpreadsheetApp from './App.jsx'
import './index.css'

// Render the main SpreadsheetApp component into the root DOM element
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SpreadsheetApp />
  </React.StrictMode>,
)