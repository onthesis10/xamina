use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;
use uuid::Uuid;

/// A message that can be sent over WebSocket
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum WsMessage {
    /// Broadcast: a student connected to the exam room
    StudentConnected {
        student_id: Uuid,
        student_name: String,
    },
    /// Broadcast: a student disconnected from the exam room
    StudentDisconnected { student_id: Uuid },
    /// Broadcast: a student saved answers
    AnswerSaved {
        student_id: Uuid,
        answered_count: usize,
    },
    /// Broadcast: an anomaly was detected for a student
    AnomalyDetected {
        student_id: Uuid,
        event_type: String,
    },
    /// Broadcast: a student finished the exam
    StudentFinished { student_id: Uuid, score: f64 },
    /// Client → Server: heartbeat ping
    Heartbeat { student_id: Uuid },
    /// Server → Client: heartbeat acknowledged
    HeartbeatAck,
    /// Monitor → Server: force a student to submit
    ForceSubmit { student_id: Uuid },
    /// Server → Client: you have been force-submitted
    ForceSubmitAck {
        exam_id: Uuid,
        submission_id: Option<Uuid>,
    },
    /// Server → Monitor: monitor joined confirmation
    MonitorJoined { exam_id: Uuid },
    /// Server  → Client: error message
    Error { message: String },
}

/// Participant types in a WebSocket exam room
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ParticipantRole {
    Student,
    Monitor, // teacher, admin, super_admin
}

/// A single participant's sender channel
#[derive(Debug, Clone)]
pub struct Participant {
    pub connection_id: Uuid,
    pub user_id: Uuid,
    pub name: String,
    pub role: ParticipantRole,
    pub tx: mpsc::UnboundedSender<WsMessage>,
    pub last_heartbeat_unix: i64,
}

/// Room = one exam session being monitored
#[derive(Debug, Default)]
pub struct ExamRoom {
    pub participants: Vec<Participant>,
}

/// Global WebSocket state, keyed by exam_id
#[derive(Debug, Default, Clone)]
pub struct WsState {
    rooms: Arc<DashMap<Uuid, ExamRoom>>,
}

#[derive(Debug, Clone, Copy)]
pub struct StaleParticipant {
    pub exam_id: Uuid,
    pub user_id: Uuid,
    pub role: ParticipantRole,
}

#[derive(Debug, Clone, Copy)]
pub struct LeaveParticipant {
    pub user_id: Uuid,
    pub role: ParticipantRole,
    pub fully_disconnected: bool,
}

impl WsState {
    pub fn new() -> Self {
        Self {
            rooms: Arc::new(DashMap::new()),
        }
    }

    /// Add a participant to an exam room. Returns a tuple of (connection_id, receiver channel).
    pub fn join_room(
        &self,
        exam_id: Uuid,
        user_id: Uuid,
        name: String,
        role: ParticipantRole,
    ) -> (Uuid, mpsc::UnboundedReceiver<WsMessage>) {
        let (tx, rx) = mpsc::unbounded_channel();
        let now_unix = now_unix_seconds();
        let connection_id = Uuid::new_v4();
        let participant = Participant {
            connection_id,
            user_id,
            name,
            role,
            tx,
            last_heartbeat_unix: now_unix,
        };

        self.rooms
            .entry(exam_id)
            .or_default()
            .participants
            .push(participant);

        (connection_id, rx)
    }

    /// Remove a participant connection from an exam room.
    /// Returns metadata about the user disconnection state when a matching connection is found.
    pub fn leave_room(&self, exam_id: Uuid, connection_id: Uuid) -> Option<LeaveParticipant> {
        if let Some(mut room) = self.rooms.get_mut(&exam_id) {
            let removed_index = room
                .participants
                .iter()
                .position(|p| p.connection_id == connection_id)?;
            let removed = room.participants.remove(removed_index);
            let fully_disconnected = !room
                .participants
                .iter()
                .any(|p| p.user_id == removed.user_id);
            if room.participants.is_empty() {
                drop(room);
                self.rooms.remove(&exam_id);
            }
            return Some(LeaveParticipant {
                user_id: removed.user_id,
                role: removed.role,
                fully_disconnected,
            });
        }
        None
    }

    /// Broadcast a message to all participants in a room
    pub fn broadcast_to_room(&self, exam_id: Uuid, msg: &WsMessage) {
        if let Some(room) = self.rooms.get(&exam_id) {
            for p in &room.participants {
                let _ = p.tx.send(msg.clone());
            }
        }
    }

    /// Send a message to monitors only in a room
    pub fn broadcast_to_monitors(&self, exam_id: Uuid, msg: &WsMessage) {
        if let Some(room) = self.rooms.get(&exam_id) {
            for p in &room.participants {
                if p.role == ParticipantRole::Monitor {
                    let _ = p.tx.send(msg.clone());
                }
            }
        }
    }

    /// Send a message to all active connections of a user in a room.
    pub fn send_to_user(&self, exam_id: Uuid, user_id: Uuid, msg: &WsMessage) {
        if let Some(room) = self.rooms.get(&exam_id) {
            for p in &room.participants {
                if p.user_id == user_id {
                    let _ = p.tx.send(msg.clone());
                }
            }
        }
    }

    /// Get a list of connected students in a room
    pub fn connected_students(&self, exam_id: Uuid) -> Vec<(Uuid, String)> {
        self.rooms
            .get(&exam_id)
            .map(|room| {
                let mut dedup = HashMap::<Uuid, String>::new();
                room.participants
                    .iter()
                    .filter(|p| p.role == ParticipantRole::Student)
                    .for_each(|p| {
                        dedup.entry(p.user_id).or_insert_with(|| p.name.clone());
                    });
                dedup.into_iter().collect()
            })
            .unwrap_or_default()
    }

    pub fn mark_heartbeat(&self, exam_id: Uuid, connection_id: Uuid) -> bool {
        if let Some(mut room) = self.rooms.get_mut(&exam_id) {
            let now_unix = now_unix_seconds();
            for participant in &mut room.participants {
                if participant.connection_id == connection_id {
                    participant.last_heartbeat_unix = now_unix;
                    return true;
                }
            }
        }
        false
    }

    pub fn sweep_stale_participants(&self, timeout_secs: i64) -> Vec<StaleParticipant> {
        let now_unix = now_unix_seconds();
        let mut stale = Vec::new();
        let mut empty_rooms = Vec::new();

        for mut room_entry in self.rooms.iter_mut() {
            let exam_id = *room_entry.key();
            let mut stale_connections = Vec::<(Uuid, ParticipantRole)>::new();
            room_entry.participants.retain(|participant| {
                let is_stale = now_unix - participant.last_heartbeat_unix > timeout_secs;
                if is_stale {
                    stale_connections.push((participant.user_id, participant.role));
                }
                !is_stale
            });

            let mut seen = HashSet::<(Uuid, ParticipantRole)>::new();
            for (user_id, role) in stale_connections {
                if !seen.insert((user_id, role)) {
                    continue;
                }
                let still_connected = room_entry.participants.iter().any(|p| p.user_id == user_id);
                if !still_connected {
                    stale.push(StaleParticipant {
                        exam_id,
                        user_id,
                        role,
                    });
                }
            }

            if room_entry.participants.is_empty() {
                empty_rooms.push(exam_id);
            }
        }

        for exam_id in empty_rooms {
            self.rooms.remove(&exam_id);
        }

        stale
    }
}

fn now_unix_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::{ParticipantRole, WsState};
    use uuid::Uuid;

    #[test]
    fn leave_room_should_only_remove_one_connection_for_same_user() {
        let state = WsState::new();
        let exam_id = Uuid::new_v4();
        let user_id = Uuid::new_v4();

        let (conn_a, _rx_a) = state.join_room(
            exam_id,
            user_id,
            "Student A".to_string(),
            ParticipantRole::Student,
        );
        let (conn_b, _rx_b) = state.join_room(
            exam_id,
            user_id,
            "Student A".to_string(),
            ParticipantRole::Student,
        );

        let leave_a = state
            .leave_room(exam_id, conn_a)
            .expect("first leave should find participant");
        assert!(!leave_a.fully_disconnected);

        let students = state.connected_students(exam_id);
        assert_eq!(students.len(), 1);
        assert_eq!(students[0].0, user_id);

        let leave_b = state
            .leave_room(exam_id, conn_b)
            .expect("second leave should find participant");
        assert!(leave_b.fully_disconnected);
    }

    #[test]
    fn connected_students_should_dedupe_same_student_multi_connection() {
        let state = WsState::new();
        let exam_id = Uuid::new_v4();
        let user_a = Uuid::new_v4();
        let user_b = Uuid::new_v4();

        let (_a1, _rx_a1) = state.join_room(
            exam_id,
            user_a,
            "Student A".to_string(),
            ParticipantRole::Student,
        );
        let (_a2, _rx_a2) = state.join_room(
            exam_id,
            user_a,
            "Student A".to_string(),
            ParticipantRole::Student,
        );
        let (_b1, _rx_b1) = state.join_room(
            exam_id,
            user_b,
            "Student B".to_string(),
            ParticipantRole::Student,
        );

        let students = state.connected_students(exam_id);
        assert_eq!(students.len(), 2);
    }
}
