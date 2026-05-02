import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/base.scss";

/* StrictMode is intentionally omitted — deck.gl's WebGL device does not
   survive the double-mount cycle, causing a "maxTextureDimension2D" crash
   in the ResizeObserver callback. See: github.com/visgl/deck.gl/discussions/9857 */
createRoot(document.getElementById("root")!).render(<App />);
