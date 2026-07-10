import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, MoreVertical, Pencil, Trash2, ArrowRight, ArrowLeft, Check, History } from "lucide-react";
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

export default function TaskCard({ task, onEdit, onDelete, onChangeStatus, onLogTime, onViewHistory, canEdit = true, showAssignee = false, draggable = false, onDragStart, onDragEnd, compact = false, showInProgressDate = false }) {
  const due = task.due_date ? parseISO(task.due_date) : null;
  const overdue = due && task.status !== "done" && isPast(due);
  const iconSize = compact ? 10 : 14;
  const smallIconSize = compact ? 8 : 12;

  return (
    <div
      data-testid={`task-card-${task.id}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group flex flex-col border border-slate-200 bg-white transition-all hover:-translate-y-0.5 hover:border-slate-300 ${compact ? "gap-[8px] p-[11px]" : "gap-3 p-4"} ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <Badge variant="outline" className={`rounded-sm border uppercase tracking-widest ${compact ? "text-[7px]" : "text-[10px]"} ${PRIORITY_COLOR[task.priority]}`} data-testid={`task-priority-${task.id}`}>
            {task.priority}
          </Badge>
          <h4 className={`font-display font-semibold leading-snug text-slate-900 ${compact ? "text-[11px]" : "text-base"}`} data-testid={`task-title-${task.id}`}>{task.title}</h4>
        </div>
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className={`text-slate-400 hover:text-slate-700 ${compact ? "h-5 w-5" : "h-7 w-7"}`} data-testid={`task-menu-${task.id}`}>
                <MoreVertical size={iconSize} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => onEdit?.(task)} data-testid={`task-edit-${task.id}`}>
                <Pencil size={14} /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onLogTime?.(task)} data-testid={`task-log-time-${task.id}`}>
                <Clock size={14} /> Log time
              </DropdownMenuItem>
              {onViewHistory && (
                <DropdownMenuItem onClick={() => onViewHistory(task)} data-testid={`task-history-${task.id}`}>
                  <History size={14} /> View history
                </DropdownMenuItem>
              )}
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
        <p className={`line-clamp-2 text-slate-600 ${compact ? "text-[10px]" : "text-sm"}`}>{task.description}</p>
      )}

      <div className={`mt-1 flex flex-wrap items-center text-slate-500 ${compact ? "gap-[8px] text-[8px]" : "gap-3 text-xs"}`}>
        {due && (
          <span data-testid={`task-due-${task.id}`} className={overdue ? "font-medium text-red-600" : ""}>
            Due {format(due, "MMM d")}
          </span>
        )}
        <span data-testid={`task-hours-${task.id}`} className="inline-flex items-center gap-1">
          <Clock size={smallIconSize} /> {Number(task.hours_logged || 0).toFixed(1)}h
        </span>
        {showInProgressDate ? (
          <span data-testid={`task-in-progress-${task.id}`}>
            {task.in_progress_at
              ? `In progress since ${format(parseISO(task.in_progress_at), "MMM d, yyyy 'at' h:mm a")}`
              : "Not started"}
          </span>
        ) : task.created_at && (
          <span data-testid={`task-created-${task.id}`} title="System-generated creation timestamp">
            Created {format(parseISO(task.created_at), "MMM d, yyyy 'at' h:mm a")}
          </span>
        )}
        {showAssignee && task.assignee && (
          <span className="ml-auto inline-flex items-center gap-1">
            <span className={`grid place-items-center rounded-full bg-klein font-semibold text-white ${compact ? "h-3.5 w-3.5 text-[7px]" : "h-5 w-5 text-[10px]"}`}>
              {task.assignee.name?.charAt(0)?.toUpperCase()}
            </span>
            {task.assignee.name}
          </span>
        )}
      </div>
    </div>
  );
}
