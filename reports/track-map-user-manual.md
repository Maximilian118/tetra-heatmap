---
pdf_options:
  format: A4
  margin: 25mm
  headerTemplate: '<div></div>'
  footerTemplate: '<div style="width:100%;text-align:center;font-size:9px;color:#999;padding:0 25mm;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>'
  displayHeaderFooter: true
stylesheet: []
body_class: manual
---

<style>
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #222; line-height: 1.6; }
  h1 { color: #c0392b; border-bottom: 3px solid #c0392b; padding-bottom: 8px; font-size: 28px; }
  h2 { color: #2c3e50; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-top: 32px; font-size: 20px; }
  h3 { color: #34495e; margin-top: 20px; font-size: 16px; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid #ccc; padding: 8px 12px; text-align: left; font-size: 13px; }
  th { background: #ecf0f1; font-weight: 600; }
  blockquote { border-left: 4px solid #c0392b; background: #fdf2f2; padding: 10px 16px; margin: 16px 0; font-size: 13px; }
  code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
  .step-number { display: inline-block; background: #c0392b; color: white; width: 24px; height: 24px; border-radius: 50%; text-align: center; line-height: 24px; font-weight: bold; font-size: 13px; margin-right: 6px; }

  .tip { border-left: 4px solid #27ae60; background: #eafaf1; padding: 10px 16px; margin: 12px 0; font-size: 13px; }
  .warning { border-left: 4px solid #e67e22; background: #fef5e7; padding: 10px 16px; margin: 12px 0; font-size: 13px; }
</style>

# Tetra Heatmap — Track Map PDF User Manual

**Riedel Communications — TETRA RSSI Coverage Reporting**

---

## 1. Introduction

### What is Tetra Heatmap?

Tetra Heatmap is an application developed by Riedel Communications that visualises TETRA radio signal strength (RSSI) data on an interactive map. It connects to a DAMM TetraFlex LogServer, collects GPS position and signal quality readings from TETRA radios, and displays the data as a colour-coded heatmap overlay.

### What is a Track Map PDF?

A Track Map PDF is a professional coverage report that shows RSSI signal quality across every sector of a race circuit. The report includes:

- A map of the circuit with sectors colour-coded by signal quality
- A legend explaining the RSSI colour bands
- A table of median RSSI values for each sector
- Symbols showing the positions of base stations and repeaters
- Notes highlighting areas of interest or concern
- Riedel Communications branding

This document walks you through the complete process — from preparing the radios before you arrive at the circuit, through to exporting the finished PDF report.

---

## 2. Radio Preparation — Before Going to the Track

Before any data can be collected, you need to prepare the four dedicated GPS radios. These radios have a special codeplug (radio configuration) that enables high-frequency GPS position reporting.

### The Four GPS Radios

| Radio | ISSI | Purpose |
|-------|------|---------|
| GPS Radio 1 | **9999** | Track mapping |
| GPS Radio 2 | **9998** | Track mapping |
| GPS Radio 3 | **9997** | Track mapping |
| GPS Radio 4 | **9996** | Track mapping |

These four radios are specifically configured with a codeplug that reports their GPS position via LIP (Location Information Protocol) every **30 seconds** — this is the fastest periodic reporting interval available in the TETRA standard.

### Why Four Radios?

A single radio reporting every 30 seconds would leave large gaps in coverage data as a vehicle moves around the circuit. By using four radios and staggering their power-on times, you create an **effective reporting interval of approximately 10 seconds**, giving a much more complete picture of signal quality across the entire track.

### Power-On Procedure

The radios must be powered on in a specific sequence to achieve the staggered reporting intervals:

<span class="step-number">1</span> Power on **Radio 9999** (ISSI 9999).

<span class="step-number">2</span> Wait **10 seconds**, then power on **Radio 9998** (ISSI 9998).

<span class="step-number">3</span> Wait **10 seconds**, then power on **Radio 9997** (ISSI 9997).

<span class="step-number">4</span> Wait **10 seconds**, then power on **Radio 9996** (ISSI 9996).

Each radio begins its 30-second reporting cycle from the moment it is powered on. By staggering them by 10 seconds, their reports interleave across time:

| Time (s) | Reporting Radio |
|----------|-----------------|
| 0 | 9999 |
| 10 | 9998 |
| 20 | 9997 |
| 30 | 9996 and 9999 |
| 40 | 9998 |
| 50 | 9997 |
| 60 | 9996 and 9999 |

This gives you a GPS + RSSI reading from somewhere on the track roughly every 10 seconds.

### Placing the Radios

Once powered on in sequence, place all four radios in the vehicle(s) that will be driving the circuit. Ensure the radios have a clear view of the sky for GPS reception — placing them on the dashboard or parcel shelf works well. Drive the complete circuit, covering every sector, pit lane, and any access roads you want to measure.

<div class="tip">
<strong>Tip:</strong> With all four radios reporting at staggered 10-second intervals, a single lap of the circuit is sufficient to build a complete picture of RSSI values across every sector.
</div>

---

## 3. Application Setup — The Settings Tab

With the radios collecting data on-track, open the Tetra Heatmap application in your browser. The first step is to connect the application to the TetraFlex LogServer so it can retrieve the RSSI readings.

### Connecting to the LogServer

<span class="step-number">1</span> In the sidebar, click the **Settings** tab (next to the "Map" tab at the top).

<span class="step-number">2</span> Enter the TetraFlex LogServer connection details:

| Field | Description |
|-------|-------------|
| **Host** | The IP address of the LogServer (e.g. `10.46.72.41`) |
| **Port** | The MySQL port, typically `3306` |
| **Username** | Your database username (e.g. `track-map`) |
| **Password** | Your database password |
| **Database** | The log database name (e.g. `tetraflexlogdb`) |

<span class="step-number">3</span> Configure the **Sync** settings:

| Setting | Recommended Value | Description |
|---------|-------------------|-------------|
| **Poll Interval (ms)** | `60000` | How often the app checks for new data (60,000 ms = 1 minute) |
| **Batch Size** | `10000` | Maximum rows fetched per sync cycle |
| **Retention (days)** | `5` | How many days of data to keep in the local cache |

<span class="step-number">4</span> Enter your **Mapbox Access Token** in the field at the bottom. This token is required for the map tiles to load. If you do not have one, create a free account at `account.mapbox.com/access-tokens`.

<span class="step-number">5</span> Click the **Apply** button at the very bottom of the Settings panel.

<span class="step-number">6</span> Confirm the status indicator at the top changes to a green **CONNECTED** badge with the message "TetraFlex Logserver Version 8.x".

### Verifying the Connection — Logserver Stats

To verify the connection is working and inspect the TetraFlex system:

<span class="step-number">1</span> On the Settings tab, click the **info icon** (ⓘ) next to the CONNECTED status.

<span class="step-number">2</span> The **Logserver Stats** overlay opens, displaying:

- **Server** information — version, hostname, uptime, timezone
- **System** resources — CPU load, memory usage, disk usage, database size
- **Network** — number of nodes, their names, individual/group subscriber counts
- **Activity** — call counts, SDS messages, last activity timestamps
- **Logging** — toggle switches for different log types

This overlay is useful for confirming the LogServer is healthy and that data is flowing.

<span class="step-number">3</span> Close the overlay by clicking the **X** in the top-right corner.

---

## 4. Monitoring Data — The SSI Register

Once connected, the application begins syncing RSSI readings from the LogServer. You can monitor which radios are reporting and how much data has been collected using the **SSI Register**.

### Opening the SSI Register

<span class="step-number">1</span> Switch to the **Map** tab in the sidebar.

<span class="step-number">2</span> In the **Data Controls** section, click the **SSI Register** button.

<span class="step-number">3</span> A full-screen overlay opens showing a table of all radios (subscribers) that have sent data.

### Understanding the Register

The table displays the following columns:

| Column | Description |
|--------|-------------|
| **ISSI** | The Individual Short Subscriber Identity — each radio's unique number |
| **Description** | A human-readable name for the radio (e.g. "FIA GPS", "EMM 4") |
| **Organisation** | The organisation the radio belongs to |
| **Profile** | The radio's subscriber profile |
| **Readings** | Total number of GPS/RSSI readings received from this radio |
| **Last Reading** | Timestamp of the most recent reading |

### Locating the GPS Radios

Look for the four GPS radios at ISSI numbers **9996**, **9997**, **9998**, and **9999**. They will typically be labelled "FIA GPS" or similar in the Description column. Check that:

- All four radios appear in the list
- The **Readings** count is increasing over time (refresh by closing and reopening the register)
- The **Last Reading** timestamps are recent

### Filtering by Radio

You can click on individual rows in the SSI Register to **filter** the map display to show only readings from selected radios. This is useful if you want to isolate the four GPS radios and exclude data from other radios on the network.

- Click a row to select/deselect it
- Use the **Search** bar at the top to filter by ISSI, description, or organisation
- Click **Show All** to reset the filter
- Click **Clear** to remove all subscriber data

<div class="tip">
<strong>Tip:</strong> If other radios on the network are also reporting GPS data, their readings will appear on the map too. Use the SSI Register filter to show only the four track-mapping radios (9996–9999) for a clean track map.
</div>

---

## 5. Loading a Track KML File

To see per-sector signal quality, you need to load a KML file that defines the circuit layout — its sectors, turns, and boundaries.

### What is a KML File?

A KML (Keyhole Markup Language) file is a geographic data format that contains shapes drawn over the earth's surface. For track mapping, the KML file typically contains:

- **Polygons** — the sector boundaries (Sector 1, Sector 2, etc.)
- **Lines** — the track outline and turn markings
- **Points** — labels for turns, pit lane, safety car lines, etc.

### Loading the File

<span class="step-number">1</span> In the **Map** tab sidebar, find the layer type buttons at the top (Heat, Hex, Path, KML).

<span class="step-number">2</span> Click the **KML** button.

<span class="step-number">3</span> A file picker opens — select your `.kml` file.

<span class="step-number">4</span> The circuit appears on the map with sectors outlined, turn numbers labelled, and the track boundary drawn.

### Understanding the KML View

Once loaded, the KML layer colours each sector polygon based on the **median RSSI** of all readings that fall within (or near) that sector. Sectors with strong signal appear green, while sectors with weak signal appear red/orange — following the active colour spectrum.

Sectors with no readings appear in dark grey, indicating no data has been collected in that area yet.

### KML Layer Controls

After loading a KML file, a **KML Layers** section appears in the sidebar showing each folder from the KML file (e.g. "Lines", "Turns", "Sectors"). For each folder you can:

- **Toggle visibility** using the checkbox
- **Change the colour** using the colour picker
- **Adjust line width** using the slider (for line-type layers)

### Hovering Over Sectors

Hover your mouse over any sector polygon to see a tooltip displaying:

- **Sector name** (e.g. "Sector 01")
- **Median RSSI** in dBm
- **Min / Max RSSI** range
- **Reading count** — how many data points are in that sector

---

## 6. Placing Symbols — Base Stations and Repeaters

To show the physical locations of your TETRA infrastructure on the map (and in the final PDF), you can place symbols for base stations and repeaters.

### Opening the Symbols Tab

<span class="step-number">1</span> In the **Map** tab sidebar, click the **Symbols** button in the Data Controls section.

<span class="step-number">2</span> The sidebar switches to the **Symbols** tab, showing a **"Drag to Place"** palette at the top with three icon types.

### Symbol Types

| Icon | Type | Use For |
|------|------|---------|
| 🔵 Tower icon | **Base Station** | DAMM base station locations |
| 🟢 Antenna icon | **Repeater (Omni)** | Omnidirectional repeater locations |
| 🟣 Directional icon | **Repeater (Directional)** | Directional repeater locations |

### Placing a Symbol

<span class="step-number">1</span> Click and drag an icon from the palette onto the map.

<span class="step-number">2</span> Drop it at the correct location.

<span class="step-number">3</span> The symbol appears on the map and is listed in the sidebar under **Placed** symbols, grouped by category (Base Station / Repeater).

<span class="step-number">4</span> Adjust the **Size** slider at the top to change how large the symbols appear.

### Editing a Placed Symbol

Click on any placed symbol on the map to open the **Radial Menu** — a circular menu with three options:

| Button | Action |
|--------|--------|
| **Backup** (top) | Toggles the symbol as a backup unit — changes its appearance |
| **Delete** (left) | Removes the symbol from the map |
| **Inactive** (right) | Marks the unit as inactive — shows it with a strikethrough style |

For **directional repeaters**, a direction slider (0–360 degrees) appears in the sidebar, letting you set the antenna bearing with a compass label (N, NE, E, etc.).

---

## 7. Customising the Colour Spectrum

By default, the application uses a continuous colour gradient to represent RSSI values. For clearer reporting, you can define **custom colour bands** that group RSSI ranges into named quality levels.

### Opening the Colour Editor

<span class="step-number">1</span> Click anywhere on the **RSSI legend bar** at the bottom of the map.

<span class="step-number">2</span> The sidebar switches to the **Colours** tab.

### Enabling the Custom Spectrum

<span class="step-number">1</span> Toggle the **"Use custom spectrum"** checkbox at the top of the Colours panel.

<span class="step-number">2</span> A colour bar with discrete bands appears, along with a list of editable bands below it.

### Editing Colour Bands

Each band has the following controls:

| Control | Description |
|---------|-------------|
| **Colour swatch** | Click to open a colour picker and change the band's colour |
| **Label** | Editable text name (e.g. "Very good", "Good", "Moderate", "Weak", "Not usable") |
| **dBm range** | Shows the min and max dBm values for this band (set by dragging the boundaries on the bar above) |
| **Expand arrow** | Click to expand/collapse the band details |
| **Delete** | Remove this band |

### Adjusting Boundaries

Drag the boundary handles on the colour bar to adjust where one band ends and the next begins. The dBm values update automatically as you drag.

### Recommended Bands for Track Maps

| Band | Colour | dBm Range | Meaning |
|------|--------|-----------|---------|
| Very good | Green | -61 to -20 dBm | Excellent signal — no issues |
| Good | Yellow-green | -75 to -61 dBm | Good signal — reliable coverage |
| Moderate | Yellow | -87 to -75 dBm | Adequate but approaching cell edge |
| Weak | Orange | -96 to -87 dBm | Poor signal — may experience issues |
| Not usable | Red | -200 to -96 dBm | Critical — link failure likely |

### Additional Controls

- **+ Add Range** — splits the widest band into two, letting you add finer granularity
- **Reset to Default** — reverts to the original continuous colour gradient

---

## 8. Adding Notes

Notes let you annotate the map with coloured areas and text descriptions. These annotations carry through into the final PDF report, making them ideal for highlighting problem areas, planned improvements, or observations.

### Opening the Notes Tab

<span class="step-number">1</span> Click the **Notes** button that appears as an overlay on the map (top area), or navigate to the Notes tab in the sidebar.

### Placing a Coloured Area Note

<span class="step-number">1</span> In the Notes tab, you will see a **"Drag to Place Area"** palette with six colours: Red, Orange, Yellow, Green, Blue, and Purple.

<span class="step-number">2</span> Click and drag a colour from the palette onto the map.

<span class="step-number">3</span> A semi-transparent coloured rectangle appears on the map at the drop location.

<span class="step-number">4</span> The note is added to the **Notes** list in the sidebar where you can:

- **Edit the title** — click the title field and type a name (e.g. "Weak coverage zone")
- **Edit the description** — click the text area and type details (e.g. "This is the exit zone — consider adding a repeater")
- **Fly to** — click the location icon to centre the map on this note
- **Delete** — click the X icon to remove the note

### Adding a Text-Only Note

Click the **+ Add Note** button to create a note without a map area. This is useful for general observations that don't relate to a specific location (e.g. "Survey conducted in dry conditions, 22°C").

<div class="tip">
<strong>Tip:</strong> Notes appear in the final PDF report in a dedicated panel. Keep titles short and descriptions concise — they need to fit in the report layout.
</div>

---

## 9. Generating the PDF Report

With your data collected, KML loaded, symbols placed, colours configured, and notes added, you are ready to generate the final PDF report.

### Opening the Report Preview

<span class="step-number">1</span> Switch to the **Map** tab in the sidebar.

<span class="step-number">2</span> Scroll to the bottom of the sidebar and click the **Generate Report** button.

<span class="step-number">3</span> The application switches to **Report Mode**:

- The map style automatically changes to a light, print-friendly style
- KML layer lines change to black for readability
- An A4-proportioned **report preview** appears overlaid on the map

### Understanding the Report Layout

The report preview contains several elements:

#### Header Banner
A red Riedel Communications branded banner at the top with:
- The Riedel logo
- An **editable title** — automatically generated based on reverse-geocoding the map location (e.g. "RSSI Coverage Report - Austria 2026"). Click the title text to edit it.

#### Map Area
The main body of the report is an interactive map showing:
- The KML track outline with sectors coloured by median RSSI
- Placed base station and repeater symbols
- Note areas (coloured rectangles)

> **Important:** This map is independent of the main application map. You can **pan**, **zoom**, and **rotate** the report map separately to frame the circuit exactly as you want it to appear in the final PDF. Hold **Shift + drag** to rotate the map.

#### Legend (Bottom Left)
Shows the RSSI colour bands with their dBm ranges and labels (e.g. Critical, Poor, Marginal, Good — or your custom band names). Also displays icons for any placed base stations and repeaters. A **scale bar** shows the map distance scale.

#### Sector Median Table (Bottom Left, below Legend)
A compact table showing the **median**, **min**, and **max** RSSI values for each sector. Sector names are formatted for readability (e.g. "PIT" for the pit lane, numbered sectors "01" through "11").

#### Notes Panel (Bottom Right)
Displays all your notes with their colour swatches, titles, and description text. The panel height automatically matches the left-side legend for a balanced layout.

### Adjusting the Report

While in report mode, you can still make adjustments:

- **Edit the title** — click the title text in the red banner
- **Pan/zoom the map** — drag and scroll on the report map to frame the circuit
- **Rotate the map** — hold Shift and drag to tilt or rotate
- **Modify layer settings** — the sidebar shows Map Presets and Customise controls. Adjust KML scope, label offset, or layer visibility as needed.

### Saving the PDF

<span class="step-number">1</span> Once you are happy with the report layout, click the **Save PDF** button at the bottom of the screen.

<span class="step-number">2</span> The application captures the entire report preview at high resolution (2x scale for print quality).

<span class="step-number">3</span> A PDF file is generated and automatically downloaded to your browser's default download location.

<span class="step-number">4</span> To exit report mode without saving, click the **Cancel** button instead.

### After Saving

Click **Cancel** (or the **Close** button in the sidebar) to exit report mode. The map returns to its original style and colours.

---

## 10. Tips and Best Practices

### Data Collection

- **Drive the full circuit** — ensure every sector, including the pit lane and access roads, is covered during the lap.
- **Cover all areas** — don't forget the pit lane, paddock access roads, and any areas outside the main circuit where radio coverage is needed.
- **Check GPS accuracy** — use the GPS Accuracy filter in the sidebar to exclude inaccurate readings. The tightest setting (2 m) gives the most precise positions but may reduce the number of usable readings.
- **Monitor the SSI Register** — periodically check that all four GPS radios are reporting. If a radio stops reporting, it may have lost GPS lock or powered off.

### Map Presentation

- **Use the KML layer mode** for sector-by-sector analysis in reports — it gives the clearest per-sector breakdown.
- **Set the Data Age slider** to focus on data from the current survey only, filtering out older readings from previous visits.
- **Use custom colour bands** rather than the continuous gradient for reports — named quality levels (Very good, Good, Moderate, Weak, Not usable) are much easier for stakeholders to interpret.
- **Place symbols accurately** — base station and repeater positions on the map help readers understand the relationship between infrastructure placement and signal quality.

### Report Quality

- **Frame the map carefully** — zoom and pan the report map so the entire circuit fits within the preview with some margin around the edges.
- **Write concise notes** — note titles and descriptions appear in the PDF and should be brief enough to read at a glance.
- **Edit the title** — the auto-generated title based on location is a good starting point, but customise it to include the event name, date, or purpose (e.g. "RSSI Coverage Report - Pre-Event Survey - June 2026").
- **Review the sector stats table** — before saving, check that all sectors have data (non-zero reading counts). Sectors showing no data may indicate gaps in the drive route.

### Troubleshooting

| Problem | Solution |
|---------|----------|
| No data appearing on the map | Check the Settings tab — ensure the status shows CONNECTED. Verify the Poll Interval and that the radios are powered on. |
| GPS radios not in the SSI Register | The radios may not have acquired GPS lock yet. Ensure they have a clear sky view and wait a few minutes. |
| Sectors showing grey (no data) | Drive through those sectors again. Grey means no RSSI readings fell within the sector's polygon boundary. Increase the **Scope** slider in KML customisation to widen the capture radius. |
| Report map looks different from main map | The report uses its own independent map view. Pan and zoom within the report preview to match your desired framing. |
| PDF download doesn't start | Ensure your browser allows downloads. The capture process takes a few seconds — wait for it to complete. |

<div style="page-break-before: always;"></div>

## Quick Reference — Complete Workflow Checklist

1. ☐ Power on Radio 9999 (ISSI 9999)
2. ☐ Wait 10s → Power on Radio 9998 (ISSI 9998)
3. ☐ Wait 10s → Power on Radio 9997 (ISSI 9997)
4. ☐ Wait 10s → Power on Radio 9996 (ISSI 9996)
5. ☐ Place all radios in the survey vehicle
6. ☐ Open Tetra Heatmap and confirm CONNECTED status
7. ☐ Drive the complete circuit
8. ☐ Open the SSI Register and verify all 4 radios are reporting
9. ☐ Load the track KML file
10. ☐ Place base station and repeater symbols
11. ☐ Customise the colour spectrum with named quality bands
12. ☐ Add notes for any areas of interest
13. ☐ Click **Generate Report**
14. ☐ Edit the report title
15. ☐ Frame the map in the report preview
16. ☐ Review the legend, sector stats, and notes
17. ☐ Click **Save PDF**

---

*Tetra Heatmap v0.6.0 — Riedel Communications*
