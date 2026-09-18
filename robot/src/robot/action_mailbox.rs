use super::resources::ActionMsg;
use crate::rl::ENVIRONMENT_VERSION;

#[derive(Default)]
pub struct ActionMailbox {
    next_id: u64,
    expected: Option<(u64, u64)>,
    reply: Option<ActionMsg>,
}
impl ActionMailbox {
    pub fn begin(&mut self, episode: u64) -> Option<u64> {
        if self.expected.is_some() {
            return None;
        }
        self.next_id += 1;
        self.expected = Some((episode, self.next_id));
        Some(self.next_id)
    }
    pub fn receive(&mut self, message: ActionMsg) {
        if message.protocol_version == ENVIRONMENT_VERSION
            && self.expected == Some((message.episode, message.request_id))
            && message.action.len() == crate::rl::ACT_DIM
            && message
                .action
                .iter()
                .all(|a| a.is_finite() && a.abs() <= 1.0)
        {
            self.reply = Some(message);
        }
    }
    pub fn take(&mut self) -> Option<ActionMsg> {
        let reply = self.reply.take()?;
        self.expected = None;
        Some(reply)
    }
    pub fn cancel(&mut self) {
        self.expected = None;
        self.reply = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn response(episode: u64, request_id: u64) -> ActionMsg {
        ActionMsg {
            protocol_version: ENVIRONMENT_VERSION,
            episode,
            request_id,
            action: vec![0.0; crate::rl::ACT_DIM],
            stats: None,
        }
    }
    #[test]
    fn bounds_requests_and_discards_stale_reset_reconnect_and_duplicate_replies() {
        let mut mailbox = ActionMailbox::default();
        let old = mailbox.begin(1).unwrap();
        assert!(mailbox.begin(1).is_none());
        mailbox.cancel();
        let new = mailbox.begin(2).unwrap();
        mailbox.receive(response(1, old));
        assert!(mailbox.take().is_none());
        mailbox.receive(response(1, new));
        assert!(mailbox.take().is_none());
        let mut invalid = response(2, new);
        invalid.protocol_version = 1;
        mailbox.receive(invalid);
        assert!(mailbox.take().is_none());
        mailbox.receive(response(2, new));
        assert!(mailbox.take().is_some());
        mailbox.receive(response(2, new));
        assert!(mailbox.take().is_none());
    }
}
