// Paramètre d'URL ?branche=… (onglets À faire et Carte) : un nom invalide est simplement ignoré
// (retour à la branche actuelle) ; le serveur le revalide et vérifie qu'il existe dans le dépôt.
import { z } from "zod";
import { isValidBranchName } from "./logic";

export const branchParam = z.string().refine(isValidBranchName).optional().catch(undefined);
