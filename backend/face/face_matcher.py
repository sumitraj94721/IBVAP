"""
IBVAP - Intelligent Border Video Analytics Platform (SIH 26187)
Face Matcher & Watchlist Database Integration
Performs cosine similarity search against SQLite known_suspects with neutral terminology.
"""

import os
import json
import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone
import numpy as np

from backend.database import get_db_connection
from backend.face.face_embedding import SFaceFeatureExtractor

logger = logging.getLogger("IBVAP.FaceMatcher")

DEFAULT_MATCH_THRESHOLD = float(os.getenv("FACE_MATCH_THRESHOLD", "0.65"))


class FaceMatcher:
    """
    Matches extracted facial embeddings against enrolled watchlist & personnel records.
    Maintains neutral terminology: KNOWN PERSON vs UNKNOWN PERSON.
    """

    def __init__(self, threshold: float = DEFAULT_MATCH_THRESHOLD, similarity_thresh: Optional[float] = None, **kwargs):
        self.threshold = similarity_thresh if similarity_thresh is not None else threshold
        self.extractor = SFaceFeatureExtractor()
        self.identities: List[Dict[str, Any]] = []
        self.reload_identities()

    def reload_identities(self):
        """Loads all active enrolled facial records and their embeddings into memory."""
        self.identities.clear()
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, person_code, display_name, embedding, embedding_model, status, metadata
                FROM known_suspects
                WHERE status != 'DEACTIVATED'
            """)
            rows = cursor.fetchall()
            conn.close()

            for r in rows:
                raw_emb = r["embedding"]
                emb_array = None
                try:
                    if raw_emb:
                        emb_list = json.loads(raw_emb)
                        if isinstance(emb_list, list) and len(emb_list) > 0:
                            emb_array = np.array(emb_list, dtype=np.float32)
                except Exception:
                    emb_array = None

                self.identities.append({
                    "id": r["id"],
                    "person_code": r["person_code"],
                    "display_name": r["display_name"],
                    "embedding": emb_array,
                    "embedding_model": r["embedding_model"],
                    "status": r["status"],
                    "metadata": json.loads(r["metadata"]) if r["metadata"] else {}
                })
            logger.info(f"[+] Loaded {len(self.identities)} enrolled face identity record(s).")
        except Exception as e:
            logger.error(f"[!] Error loading face identities: {e}")

    def match(
        self,
        query_embedding: np.ndarray,
        camera_id: str = "CAM-01",
        custom_threshold: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Compare query embedding against enrolled database.
        
        Returns neutral match result:
        - MATCH FOUND / KNOWN PERSON
        - NO MATCH / UNKNOWN PERSON
        """
        threshold = custom_threshold if custom_threshold is not None else self.threshold
        timestamp = datetime.now(timezone.utc).isoformat()

        if query_embedding is None or len(self.identities) == 0:
            return {
                "face_match": False,
                "status": "UNKNOWN PERSON",
                "person_code": None,
                "display_name": "UNKNOWN",
                "similarity": 0.0,
                "threshold": threshold,
                "embedding_model": "SFace-128D",
                "camera_id": camera_id,
                "timestamp": timestamp
            }

        best_sim = 0.0
        best_match: Optional[Dict[str, Any]] = None

        for ident in self.identities:
            cand_emb = ident.get("embedding")
            if cand_emb is None:
                continue

            sim = SFaceFeatureExtractor.cosine_similarity(query_embedding, cand_emb)
            if sim > best_sim:
                best_sim = sim
                best_match = ident

        if best_match is not None and best_sim >= threshold:
            return {
                "face_match": True,
                "status": "MATCH FOUND",
                "person_code": best_match["person_code"],
                "display_name": best_match["display_name"],
                "identity_status": best_match["status"], # WATCHLIST, AUTHORIZED, etc.
                "similarity": round(best_sim, 3),
                "threshold": threshold,
                "embedding_model": best_match["embedding_model"],
                "camera_id": camera_id,
                "timestamp": timestamp
            }
        else:
            return {
                "face_match": False,
                "status": "UNKNOWN PERSON",
                "person_code": None,
                "display_name": "UNKNOWN",
                "similarity": round(best_sim, 3),
                "threshold": threshold,
                "embedding_model": "SFace-128D",
                "camera_id": camera_id,
                "timestamp": timestamp
            }

    def enroll_face(
        self,
        person_code: str,
        display_name: str,
        embedding: np.ndarray,
        status: str = "WATCHLIST",
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Enrolls a new face embedding into the known_suspects table."""
        try:
            emb_json = json.dumps(embedding.tolist())
            meta_json = json.dumps(metadata or {})
            now = datetime.now(timezone.utc).isoformat()

            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("""
                INSERT OR REPLACE INTO known_suspects
                (person_code, display_name, embedding, embedding_model, created_at, updated_at, status, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                person_code,
                display_name,
                emb_json,
                "SFace-128D",
                now,
                now,
                status,
                meta_json
            ))
            conn.commit()
            conn.close()

            self.reload_identities()
            return True
        except Exception as e:
            logger.error(f"[!] Error enrolling face {person_code}: {e}")
            return False

    def list_identities(self) -> List[Dict[str, Any]]:
        """Returns safe list of enrolled identities without exposing raw embeddings."""
        return [
            {
                "id": ident["id"],
                "person_code": ident["person_code"],
                "display_name": ident["display_name"],
                "embedding_model": ident["embedding_model"],
                "status": ident["status"],
                "has_embedding": ident["embedding"] is not None,
                "metadata": ident["metadata"]
            }
            for ident in self.identities
        ]

    def delete_identity(self, identity_id: int) -> bool:
        """Deletes an enrolled identity by ID."""
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("DELETE FROM known_suspects WHERE id = ?", (identity_id,))
            conn.commit()
            conn.close()
            self.reload_identities()
            return True
        except Exception as e:
            logger.error(f"[!] Error deleting identity {identity_id}: {e}")
            return False
