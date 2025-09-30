import { RouterProvider } from "react-router-dom";
import { router } from "./app/routes";
import { AuthProvider } from "./state/AuthContext";

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
