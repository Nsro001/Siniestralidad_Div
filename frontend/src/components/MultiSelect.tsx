type Props = {
  options: string[];
  selected: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
};

export default function MultiSelect({ options, selected, onChange, disabled }: Props) {
  const toggle = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((item) => item !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  return (
    <div className={`mt-2 rounded-2xl border border-ink/10 bg-white/80 p-3 ${disabled ? "opacity-50" : ""}`}>
      <div className="max-h-40 space-y-2 overflow-auto text-sm">
        {options.length === 0 && <div className="text-xs text-ink/60">Sin opciones</div>}
        {options.map((option) => (
          <label key={option} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={() => toggle(option)}
              disabled={disabled}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
