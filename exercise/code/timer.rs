//! A naive timer

use alloc::{boxed::Box, collections::BinaryHeap};
use core::cmp::Ordering;

/// The type of callback function.
type Callback = Box<dyn FnOnce() + Send + Sync + 'static>;

struct Node(u64, Callback);

impl Ord for Node {
    fn cmp(&self, other: &Self) -> Ordering {
        if self.0 < other.0 {
            return Ordering::Greater;
        } else if self.0 > other.0 {
            return Ordering::Less;
        } else {
            return Ordering::Equal;
        }
    }
}

impl Eq for Node {}

impl PartialOrd for Node {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl PartialEq for Node {
    fn eq(&self, other: &Self) -> bool {
        self.0 == other.0
    }
}

/// A naive timer
#[derive(Default)]
pub struct Timer {
    events: BinaryHeap<Node>,
}

impl Timer {
    /// Add a timer with given `deadline`.
    ///
    /// The `callback` will be called on timer expired.
    pub fn add(&mut self, deadline: u64, callback: impl FnOnce() + Send + Sync + 'static) {
        self.events.push(Node(deadline, Box::new(callback)));
    }

    /// Called on each tick.
    ///
    /// The caller should give the current time `now`, and all expired timer will be trigger.
    pub fn tick(&mut self, now: u64) {
        while let Some(event) = self.events.peek() {
            if event.0 > now {
                return;
            }
            let callback = self.events.pop().unwrap().1;
            callback();
        }
    }
}
