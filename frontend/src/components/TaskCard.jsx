import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, MoreVertical, Pencil, Trash2, ArrowRight, ArrowLeft, Check } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { format, parseISO, isPast } from "date-fns";

const PRIORITY_COLOR = {
  low: "bg-blue-50 text-blue-700 border-blue-200",
  medium: "bg-amber-50 text-amber-800 border-amber-200",
  high: "bg-red-50 text-red-700 border-red-200",
  urgent: "bg-red-600 text-white border-red-700",
};

const NEXT_STATUS = { todo: "in_progress", in_progress: "done", done: "in_progress" };
const PREV_STATUS = { in_progress: "todo", done: "in_progress" };

export default function TaskCard({ task, onEdit, onDelete, onChangeStatus, onLogTime, canEdit = true, showAssignee = false, draggable = false, onDragStart, onDragEnd }) {
  const due = task.due_date ? parseISO(task.due_date) : null;
  const overdue = due && task.status !== "done" && isPast(due);

  return (
    <div
      data-testid={`task-card-${task.id}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group flex flex-col gap-3 border border-slate-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-slate-300 ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <Badge variant="outline" className={`rounded-sm border text-[10px] uppercase tracking-widest ${PRIORITY_COLOR[task.priority]}`} data-testid={`task-priority-${task.id}`}>
            {task.priority}
          </Badge>
          <h4 className="font-display text-base font-semibold leading-snug text-slate-900" data-testid={`task-title-${task.id}`}>{task.title}</h4>
        </div>
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-700" data-testid={`task-menu-${task.id}`}>
                <MoreVertical size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => onEdit?.(task)} data-testid={`task-edit-${task.id}`}>
                <Pencil size={14} /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onLogTime?.(task)} data-testid={`task-log-time-${task.id}`}>
                <Clock size={14} /> Log time
              </DropdownMenuItem>
              {PREV_STATUS[task.status] && (
                <DropdownMenuItem onClick={() => onChangeStatus?.(task, PREV_STATUS[task.status])} data-testid={`task-status-back-${task.id}`}>
                  <ArrowLeft size={14} /> Move back
                </DropdownMenuItem>
              )}
              {NEXT_STATUS[task.status] && task.status !== "done" && (
                <DropdownMenuItem onClick={() => onChangeStatus?.(task, NEXT_STATUS[task.status])} data-testid={`task-status-next-${task.id}`}>
                  {NEXT_STATUS[task.status] === "done" ? <Check size={14} /> : <ArrowRight size={14} />}
                  {NEXT_STATUS[task.status] === "done" ? "Mark done" : "Advance"}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onDelete?.(task)} className="text-red-600 focus:text-red-600" data-testid={`task-delete-${task.id}`}>
                <Trash2 size={14} /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {task.description && (
        <p className="line-clamp-2 text-sm text-slate-600">{task.description}</p>
      )}

      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
        {due && (
          <span data-testid={`task-due-${task.id}`} className={overdue ? "font-medium text-red-600" : ""}>
            Due {format(due, "MMM d")}
          </span>
        )}
        <span data-testid={`task-hours-${task.id}`} className="inline-flex items-center gap-1">
          <Clock size={12} /> {Number(task.hours_logged || 0).toFixed(1)}h
        </span>
        {task.created_at && (
          <span data-testid={`task-created-${task.id}`} title="System-generated creation timestamp">
            Created {format(parseISO(task.created_at), "MMM d, yyyy 'at' h:mm a")}
          </span>
        )}
        {showAssignee && task.assignee && (
          <span className="ml-auto inline-flex items-center gap-1">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-klein text-[10px] font-semibold text-white">
              {task.assignee.name?.charAt(0)?.toUpperCase()}
            </span>
            {task.assignee.name}
          </span>
        )}
      </div>
    </div>
  );
}
