import { Children, useId, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./Dialog.jsx";
import { today } from "../data.js";

function Picker({
  value,
  display,
  disabled,
  onOpen,
  children,
  icon: Icon = ChevronDown,
  ...props
}) {
  return (
    <button
      {...props}
      type="button"
      className="picker-trigger"
      value={value}
      disabled={disabled}
      aria-haspopup="dialog"
      onClick={onOpen}
    >
      <span>{display}</span>
      <Icon size={18} />
    </button>
  );
}

export function AppSelect({ value, onChange, children, disabled, ...props }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const options = Children.toArray(children)
    .filter((child) => child?.type === "option")
    .map((child) => ({
      value: String(child.props.value ?? child.props.children),
      label: child.props.children,
      disabled: child.props.disabled,
    }));
  const selected = options.find((option) => option.value === String(value));
  return (
    <>
      <Picker
        {...props}
        value={value}
        display={selected?.label || "请选择"}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onOpen={() => setOpen(true)}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent id={id} className="app-dialog picker-dialog">
          <DialogTitle>
            {props["aria-label"] ? `选择${props["aria-label"]}` : "选择分类"}
          </DialogTitle>
          <DialogDescription>点击选项即可选择</DialogDescription>
          <div className="picker-options">
            {options.map((option) => (
              <button
                type="button"
                key={option.value}
                disabled={option.disabled}
                aria-pressed={option.value === String(value)}
                onClick={() => {
                  setOpen(false);
                  onChange({ target: { value: option.value } });
                }}
              >
                <span>{option.label}</span>
                {option.value === String(value) && <Check size={18} />}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DateTimePicker({
  type,
  value,
  onChange,
  disabled,
  required,
  ...props
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [month, setMonth] = useState("");
  const id = useId();
  const isTime = type === "time";
  const title = props["aria-label"] || (isTime ? "选择时间" : "选择日期");
  const [year, monthNumber] = (month || today().slice(0, 7))
    .split("-")
    .map(Number);
  const offset = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7;
  const days = new Date(year, monthNumber, 0).getDate();
  const moveMonth = (delta) => {
    const date = new Date(year, monthNumber - 1 + delta, 1);
    setMonth(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
    );
  };
  const commit = (next) => {
    onChange({ target: { value: next } });
    setOpen(false);
  };
  const [hour, minute] = (draft || "00:00").split(":");
  return (
    <>
      <Picker
        {...props}
        value={value}
        display={value || (isTime ? "选择时间" : "选择日期")}
        icon={isTime ? Clock : CalendarDays}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onOpen={() => {
          setDraft(value || (isTime ? "09:00" : today()));
          setMonth((value || today()).slice(0, 7));
          setOpen(true);
        }}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent id={id} className="app-dialog picker-dialog">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {isTime ? "选择小时和分钟后确认" : "选择日期后确认"}
          </DialogDescription>
          {isTime ? (
            <div className="time-columns">
              {[
                ["小时", 24, hour],
                ["分钟", 60, minute],
              ].map(([label, count, current], column) => (
                <div key={label}>
                  <h3>{label}</h3>
                  <div className="time-options">
                    {Array.from({ length: count }, (_, i) =>
                      String(i).padStart(2, "0"),
                    ).map((item) => (
                      <button
                        type="button"
                        key={item}
                        aria-label={`${item}${label}`}
                        aria-pressed={current === item}
                        onClick={() =>
                          setDraft(
                            column === 0
                              ? `${item}:${minute}`
                              : `${hour}:${item}`,
                          )
                        }
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="calendar-heading">
                <button
                  type="button"
                  aria-label="上个月"
                  onClick={() => moveMonth(-1)}
                >
                  <ChevronLeft size={20} />
                </button>
                <strong aria-live="polite">
                  {year} 年 {monthNumber} 月
                </strong>
                <button
                  type="button"
                  aria-label="下个月"
                  onClick={() => moveMonth(1)}
                >
                  <ChevronRight size={20} />
                </button>
              </div>
              <div className="calendar-grid">
                {"一二三四五六日".split("").map((day) => (
                  <span key={day}>{day}</span>
                ))}
                {Array.from({ length: offset }, (_, i) => (
                  <span key={`empty-${i}`} />
                ))}
                {Array.from({ length: days }, (_, i) => {
                  const date = `${month}-${String(i + 1).padStart(2, "0")}`;
                  return (
                    <button
                      type="button"
                      key={date}
                      aria-label={date}
                      aria-pressed={draft === date}
                      aria-current={date === today() ? "date" : undefined}
                      onClick={() => setDraft(date)}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setDraft(today());
                  setMonth(today().slice(0, 7));
                }}
              >
                今天
              </button>
            </>
          )}
          <div className="picker-actions">
            <button
              type="button"
              className="outline"
              onClick={() => setOpen(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => commit(draft)}
            >
              确认选择
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
