export const STATUS_OPTIONS = [
  { value: "not_started", label: "Not Started" },
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
];

// "Not Started" isn't a real status field value — it means a task has never moved to
// in_progress (in_progress_at is unset), which is how the urgent tasks table already
// labels them. Selecting it lets admins isolate untouched tasks specifically.
export const taskMatchesStatusFilter = (task, statusValue) =>
  statusValue === "not_started" ? !task.in_progress_at : task.status === statusValue;
