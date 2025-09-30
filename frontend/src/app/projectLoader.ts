// src/app/projectLoader.ts
import { api } from "../lib/api";

export async function projectLoader({ params, request }: any) {
  const projectId = params.projectId;
  const url = new URL(request.url);
  const shareToken = url.searchParams.get("share");

  try {
    if (shareToken) {
      await api.get(`/public/projects/${projectId}/diagram`, {
        params: { share: shareToken },
      });
      return { project: { id: projectId }, readonly: true };
    }

    const res = await api.get(`/projects/${projectId}`);
    return { project: res.data, readonly: false };
  } catch {
    throw new Response("Not Found", { status: 404 });
  }
}
