import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

// Filet de sécurité : capture toute erreur de rendu non gérée et affiche un
// écran de repli sobre (charte Tranche) plutôt qu'une page blanche.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { erreur: false };
  }
  static getDerivedStateFromError() {
    return { erreur: true };
  }
  componentDidCatch() {
    /* on pourrait remonter l'erreur à un service ici */
  }
  render() {
    if (this.state.erreur) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "18px",
            padding: "32px",
            textAlign: "center",
            background: "#E9E6DE",
            color: "#1A1815",
            fontFamily:
              "'Space Grotesk', system-ui, -apple-system, 'Segoe UI', sans-serif",
          }}
        >
          <p
            style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontSize: "26px",
              fontWeight: 600,
              margin: 0,
            }}
          >
            Une erreur est survenue
          </p>
          <p style={{ color: "#4A453E", margin: 0, maxWidth: "34ch", lineHeight: 1.5 }}>
            Tranche a rencontré un problème inattendu. Recharge l'application
            pour reprendre ta lecture.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              fontSize: "15px",
              fontWeight: 600,
              color: "#F3F1EB",
              background: "#1D4E5A",
              border: "none",
              borderRadius: "10px",
              padding: "12px 22px",
              cursor: "pointer",
            }}
          >
            Recharger
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
