export const getSessionId = () => {
  if (typeof window === "undefined") return null;
  let id = localStorage.getItem("cv_session_id");
  if (!id) {
    console.log("Nouvel utilisateur !")
    id = "user_" + Math.random().toString(36).substr(2, 9);
    localStorage.setItem("cv_session_id", id);
  }
  if(id) console.log("Utilisateur trouvé ")
  return id;
};
