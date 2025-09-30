
import { isRouteErrorResponse, useRouteError } from "react-router-dom";

export default function RootErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <div className="h-screen grid place-items-center p-8 text-center">
        <div>
          <h1 className="text-3xl font-bold mb-2">Proyecto no encontrado</h1>
          <p className="text-gray-600">
            Verifica el enlace o solicita uno nuevo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen grid place-items-center p-8 text-center">
      <div>
        <h1 className="text-2xl font-bold mb-2">Ocurrió un error</h1>
        <pre className="text-sm text-gray-500">
          {String((error as any)?.message ?? error)}
        </pre>
      </div>
    </div>
  );
}
