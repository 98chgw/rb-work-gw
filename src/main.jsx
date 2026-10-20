import React from 'react'
import ReactDOM from 'react-dom/client'
import Hub from './Hub.jsx'
import './plan/plan.scoped.css'
import './consult/consult.scoped.css'
import './issues/hwaam.scoped.css'
import './issues/hwaam.dark.css'
import './hub.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Hub />
  </React.StrictMode>
)
