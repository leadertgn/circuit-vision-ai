import { Octokit } from "octokit";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { repoUrl, content, fileName = "CIRCUIT_AUDIT.md" } = await req.json();
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

    // Extraction owner/repo
    const urlParts = repoUrl.replace("https://github.com/", "").split("/");
    const owner = urlParts[0];
    const repo = urlParts[1];

    // 1. Vérifier si le fichier existe déjà pour récupérer son SHA (nécessaire pour l'update)
    let sha;
    try {
      const { data } = await octokit.rest.repos.getContent({ owner, repo, path: fileName });
      sha = data.sha;
    } catch (e) {
      /* Le fichier n'existe pas, c'est une création */
    }

    // 2. Créer ou mettre à jour le fichier
    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: fileName,
      message: "docs: mise à jour automatique de la documentation par CircuitVision AI",
      content: Buffer.from(content).toString("base64"),
      sha: sha, // Si présent, c'est une mise à jour
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("--- ERREUR GITHUB DÉTAILLÉE ---");
    console.log("Status:", error.status); // Ex: 401, 404, 403
    console.log("Message:", error.response?.data?.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
