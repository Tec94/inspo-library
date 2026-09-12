import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./library-shell.css";
import "./library-cards.css";

const root = document.getElementById("root");
if (!root) throw new Error("The application root is missing.");
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
