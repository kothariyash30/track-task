import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, CalendarIcon, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { STATUS_OPTIONS } from "@/lib/taskFilters";

// Fully self-contained filter row: each instance owns nothing (all state lives in the
// parent), but renders independently of any other instance on the page, so two of these
// side by side (e.g. urgent tasks vs. remaining tasks) never share or interfere with
// each other's filtering.
export default function TaskFilterBar({
  testidPrefix,
  query, onQueryChange, // omit to hide the Search input
  employees, assignee, onAssigneeChange,
  priority, onPriorityChange, // omit to hide the Priority filter
  statuses, onToggleStatus, onClearStatuses,
  dateRange, onDateRangeChange, onClearDateRange, dateLabel = "In progress date", // omit onDateRangeChange to hide the date-range filter
  overdueOnly, onOverdueChange, // omit to hide the Overdue only toggle
  activeCount, onClearAll,
  resultCount, totalCount,
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 border border-slate-200 bg-white p-3">
      {onQueryChange && (
        <div className="relative w-full sm:w-56">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            data-testid={`${testidPrefix}-search`}
            placeholder="Search…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            className="h-9 rounded-md border-slate-300 pl-9 text-sm"
          />
        </div>
      )}

      <div className="flex flex-col gap-1">
        <Label className="text-[9px] uppercase tracking-[0.18em] text-slate-500">Assignee</Label>
        <Select value={assignee} onValueChange={onAssigneeChange}>
          <SelectTrigger className="h-9 w-36 rounded-md border-slate-300 text-sm" data-testid={`${testidPrefix}-assignee`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All assignees</SelectItem>
            {employees.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {onPriorityChange && (
        <div className="flex flex-col gap-1">
          <Label className="text-[9px] uppercase tracking-[0.18em] text-slate-500">Priority</Label>
          <Select value={priority} onValueChange={onPriorityChange}>
            <SelectTrigger className="h-9 w-32 rounded-md border-slate-300 text-sm" data-testid={`${testidPrefix}-priority`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any priority</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <Label className="text-[9px] uppercase tracking-[0.18em] text-slate-500">Status</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              data-testid={`${testidPrefix}-status`}
              className="h-9 w-36 justify-start rounded-md border-slate-300 text-left text-sm font-normal"
            >
              {statuses.length === 0
                ? "Any status"
                : statuses.length === STATUS_OPTIONS.length
                  ? "All statuses"
                  : statuses.map((v) => STATUS_OPTIONS.find((o) => o.value === v)?.label).join(", ")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2">
            <div className="space-y-1">
              {STATUS_OPTIONS.map((o) => (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-slate-50"
                >
                  <Checkbox
                    checked={statuses.includes(o.value)}
                    onCheckedChange={() => onToggleStatus(o.value)}
                    data-testid={`${testidPrefix}-status-option-${o.value}`}
                  />
                  {o.label}
                </label>
              ))}
            </div>
            {statuses.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearStatuses}
                className="mt-1 w-full rounded-none border-t border-slate-200 text-slate-600"
                data-testid={`${testidPrefix}-status-clear`}
              >
                <X size={14} /> Clear statuses
              </Button>
            )}
          </PopoverContent>
        </Popover>
      </div>

      {onDateRangeChange && (
        <div className="flex flex-col gap-1">
          <Label className="text-[9px] uppercase tracking-[0.18em] text-slate-500">{dateLabel}</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                data-testid={`${testidPrefix}-date`}
                className="h-9 w-44 justify-start rounded-md border-slate-300 text-left text-sm font-normal"
              >
                <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">
                  {dateRange.from
                    ? dateRange.to && dateRange.to !== dateRange.from
                      ? `${format(parseISO(dateRange.from), "MMM d")} – ${format(parseISO(dateRange.to), "MMM d")}`
                      : format(parseISO(dateRange.from), "PP")
                    : "Any date"}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="range"
                selected={{
                  from: dateRange.from ? parseISO(dateRange.from) : undefined,
                  to: dateRange.to ? parseISO(dateRange.to) : undefined,
                }}
                onSelect={(range) => onDateRangeChange({
                  from: range?.from ? format(range.from, "yyyy-MM-dd") : "",
                  to: range?.to ? format(range.to, "yyyy-MM-dd") : "",
                })}
              />
              {(dateRange.from || dateRange.to) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClearDateRange}
                  className="w-full rounded-none border-t border-slate-200 text-slate-600"
                  data-testid={`${testidPrefix}-date-clear`}
                >
                  <X size={14} /> Clear date range
                </Button>
              )}
            </PopoverContent>
          </Popover>
        </div>
      )}

      {onOverdueChange && (
        <div className="flex items-center gap-2 rounded-md border border-slate-300 px-3 h-9">
          <Switch id={`${testidPrefix}-overdue`} checked={overdueOnly} onCheckedChange={onOverdueChange} data-testid={`${testidPrefix}-overdue`} />
          <Label htmlFor={`${testidPrefix}-overdue`} className="text-xs text-slate-700">Overdue only</Label>
        </div>
      )}

      {activeCount > 0 && (
        <Button variant="ghost" size="sm" onClick={onClearAll} data-testid={`${testidPrefix}-reset`} className="h-9 text-xs text-slate-600">
          <X size={14} /> Clear ({activeCount})
        </Button>
      )}

      <div className="ml-auto text-xs text-slate-500" data-testid={`${testidPrefix}-result-count`}>
        {resultCount} of {totalCount}
      </div>
    </div>
  );
}
