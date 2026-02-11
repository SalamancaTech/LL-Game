# Lily's Life - UI & Design System Documentation

This document outlines the visual architecture, layout specifications, and aesthetic guidelines required to recreate the "Lily's Life" application interface.

## 1. Core Layout Philosophy

The application utilizes a **Dense Dashboard** approach, designed to fit all game information into a single, non-scrolling 1080p viewport (scaled via CSS).

### The Grid System
*   **Container**: `w-screen h-screen overflow-hidden`
*   **Grid Spec**: CSS Grid with **12 Columns** and **12 Rows**.
*   **Gap**: `gap-2` (approx 8px).
*   **Padding**: `p-1`.

### Zoning Map (12x12)
The screen is divided into specific zones defined by `col-span` and `row-span`:

| Zone Name | Grid Position | Spans | Description |
| :--- | :--- | :--- | :--- |
| **NPC View** | Col 1 / Row 1 | `col-span-3 row-span-7` | Large portrait container for NPC interaction. |
| **Location** | Col 4 / Row 1 | `col-span-5 row-span-4` | Environmental context image. |
| **Time Wheel** | Col 9 / Row 1 | `col-span-2 row-span-3` | Circular SVG time display. |
| **Event Slots** | Col 9 / Row 4 | `col-span-2 row-span-1` | 3 Horizontal segments for Action Points. |
| **Player View** | Col 11 / Row 1 | `col-span-2 row-span-10` | Tall vertical portrait of the player character. |
| **Narrative** | Col 4 / Row 5 | `col-span-7 row-span-5` | Scrollable text log and audio controls. |
| **Stats Panel** | Col 1 / Row 8 | `col-span-3 row-span-5` | Vertical list of stat bars and nav buttons. |
| **Intent Matrix** | Col 4 / Row 10| `col-span-3 row-span-3` | Radial SVG menu for selecting interaction types. |
| **Options** | Col 7 / Row 10| `col-span-4 row-span-3` | List of generated dialogue choices. |
| **Input Bar** | Col 11 / Row 11| `col-span-2 row-span-2` | Text area for custom input. |

---

## 2. Visual Aesthetics & Styling

### Color Palette
The app uses a dark-mode base with vibrant gradients to denote context.

*   **Background**: `bg-black` or `bg-gray-100` (User toggleable).
*   **Container Borders**: `border-gray-600` (Neutral), `border-pink-500` (Feminine/NPC), `border-blue-500` (Logic/UI).
*   **Gradients**:
    *   *NPCs*: `bg-gradient-to-b from-purple-900 to-pink-800`
    *   *Player*: `bg-gradient-to-b from-blue-900 to-purple-900`
    *   *Location*: `bg-gradient-to-tr from-blue-900 via-purple-800 to-pink-600`
*   **Glassmorphism**: Panels often use `bg-gray-900/95` with `backdrop-blur-md` to sit on top of the dense UI.

### Typography
*   **Primary UI**: `Lexend Deca` (Google Fonts). Used for all interface text, stats, and logs.
*   **Handwritten**: `Hachi Maru Pop` (Google Fonts). Used for "Polaroid" captions and names.
*   **Sizing**: The UI relies heavily on `text-[10px]` or `text-xs` with `uppercase` and `tracking-widest` to maintain legibility in small boxes.

### Component Styling

#### The Stat Bar
A custom progress bar component designed for high density.
*   **Height**: `h-4`
*   **Shape**: `rounded-full`
*   **Effect**: Includes an absolute white div with opacity to simulate a glass reflection (`bg-white/20`).
*   **Interaction**: `cursor-ew-resize` allows dragging to edit values in Dev Mode.

#### The Buttons
*   **Style**: Micro-buttons.
*   **Classes**: `text-[8px] font-bold uppercase tracking-tighter`.
*   **States**: `hover:scale-110`, `active:scale-95`.

#### The Polaroid Effect
Used in the NPC and Location lists.
*   **Container**: White background `bg-white` with padding `p-2`.
*   **Shadow**: `shadow-xl`.
*   **Transform**: Rotated slightly `rotate-[-2deg]` or `rotate-2` on hover.

---

## 3. Special UI Mechanics

### The Intent Matrix (SVG)
A custom radial menu built with SVG paths.
*   **Logic**: Calculates `Math.cos` and `Math.sin` to draw slices based on the number of Intent Types.
*   **Interaction**: Clicking a slice sets the `Intent Type`. Dragging the vertical slider on the right (`cursor-ns-resize`) sets the `Manner` (Adverb).

### The Map System
*   **Background**: A static image (Reference: 20-cell grid layout).
*   **Triggers**: Invisible or semi-transparent buttons overlaying the image.
*   **Positioning**: strictly percentage-based (`left: 20%, top: 50%`) to ensure alignment regardless of screen scale.

### Image Overlays
*   **Uploaders**: Hidden file inputs triggered by `label` elements acting as buttons.
*   **Position**: `absolute top-2 right-2`.
*   **Visibility**: `opacity-0 group-hover:opacity-100` (Only visible when hovering the container).

---

## 4. Dependencies
*   **Tailwind CSS**: Required for all utility classes.
*   **Google Fonts**: Lexend Deca, Hachi Maru Pop.
*   **React**: Component architecture.
*   **Lucide React / Heroicons**: (Optional) Used for some icons, though currently represented by Emojis in the code.
