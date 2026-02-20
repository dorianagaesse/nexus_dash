import { CONTEXT_CARD_COLORS } from "@/lib/context-card-colors";

interface ContextColorPickerProps {
  selectedColor: string;
  onSelect: (color: string) => void;
}

export function ContextColorPicker({
  selectedColor,
  onSelect,
}: ContextColorPickerProps) {
  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium">Card color</label>
      <div className="flex flex-wrap gap-2">
        {CONTEXT_CARD_COLORS.map((color) => {
          const isSelected = selectedColor === color;
          return (
            <button
              key={color}
              type="button"
              className="h-7 w-7 rounded-full border transition"
              style={{
                backgroundColor: color,
                borderColor: isSelected ? "rgb(15 23 42 / 0.9)" : "rgb(15 23 42 / 0.2)",
                boxShadow: isSelected ? "0 0 0 2px rgb(15 23 42 / 0.15)" : "none",
              }}
              onClick={() => onSelect(color)}
              aria-label={`Select color ${color}`}
            />
          );
        })}
      </div>
    </div>
  );
}
