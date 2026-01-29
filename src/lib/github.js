import { Octokit } from "octokit";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
// Remplace le contenu de ta fonction getRepoContent dans lib/github.js

export async function getRepoContent(repoUrl) {
  try {
    const urlParts = repoUrl.replace("https://github.com/", "").split("/");
    const owner = urlParts[0];
    const repo = urlParts[1];

    // Etape 1 : Lister la racine pour identifier le type de projet
    const { data: rootFiles } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: "",
    });

    let filesToFetch = [];
    const isPlatformIO = rootFiles.some((f) => f.name === "platformio.ini");

    if (isPlatformIO) {
      // STRATÉGIE PLATFORMIO : On va chercher dans /src
      try {
        const { data: srcFiles } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: "src",
        });
        // On prend les .cpp, .h, .ino dans src
        filesToFetch = srcFiles.filter((f) => f.name.match(/\.(cpp|h|ino|c)$/));
      } catch (e) {
        console.warn("Dossier src introuvable malgré platformio.ini");
      }
      // On ajoute le fichier de config pour le contexte
      filesToFetch.push(rootFiles.find((f) => f.name === "platformio.ini"));
    } else {
      // STRATÉGIE ARDUINO CLASSIQUE : On cherche à la racine
      filesToFetch = rootFiles.filter(
        (f) => f.name.toLowerCase().includes("readme") || f.name.match(/\.(ino|cpp|h|c)$/)
      );
    }

    // Etape 2 : Lecture du contenu
    const contents = await Promise.all(
      filesToFetch.map(async (file) => {
        // Attention: file.path est important ici car il inclut "src/" si nécessaire
        const contentData = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: file.path,
        });
        const text = Buffer.from(contentData.data.content, "base64").toString();
        return `--- FICHIER: ${file.path} ---\n${text}\n`;
      })
    );

    return contents.join("\n");
  } catch (error) {
    console.error("Erreur Scanner GitHub:", error);
    return "Erreur lors de la lecture du dépôt (Vérifiez qu'il est public).";
  }
}
