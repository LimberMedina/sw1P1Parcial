// src/router/index.tsx
import { createBrowserRouter, Navigate } from "react-router-dom";
import Register from "../pages/Register";
import Login from "../pages/Login";
import Dashboard from "../pages/Dashboard";
import Editor from "../pages/Editor";
import NotFound from "../uml/ui/NotFound";
import RootErrorBoundary from "../uml/ui/RootErrorBoundary";
import { projectLoader } from "./projectLoader";

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/login" /> },
  { path: "/register", element: <Register /> },
  { path: "/login", element: <Login /> },
  { path: "/app", element: <Dashboard /> },
  { path: "/app/projects/:id", element: <Editor /> },

  {
    path: "/project/:projectId",
    element: <Editor />,
    loader: projectLoader,
    errorElement: <RootErrorBoundary />,
  },

  { path: "*", element: <NotFound /> },
]);
