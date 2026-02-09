"""
Explorers — Gradio MVP

Minimal UI to launch phi-agent containers and observe their perception cycles.
Displays: species selector, execute button, real-time cycle viewer.

Architecture:
  UI (Gradio) → executor.py (Docker) → phi-agent → Sphere API
"""

import gradio as gr
import os
from executor import execute_phi_agent
from parser import parse_cycles, format_cycle_output, format_summary

# Available species (9 loadouts)
SPECIES = [
    "balanced",
    "scholar",
    "scout",
    "archivist",
    "hunter",
    "moth",
    "hermit",
    "wanderer",
    "sniper"
]

# Species descriptions (brief)
SPECIES_DESC = {
    "balanced": "Generalist — even weights, explore mode",
    "scholar": "Deep reader — high weight sensitivity, deep mode",
    "scout": "Quick surveyor — fast return, explore mode",
    "archivist": "Preservationist — loves Amber (frozen) nodes",
    "hunter": "Heat seeker — chases high-heat areas",
    "moth": "Heat generator — evaluates everything as hot",
    "hermit": "Stability seeker — avoids crowds, deep mode",
    "wanderer": "Exhaustive explorer — never returns until energy is gone",
    "sniper": "Selective evaluator — harsh scorer, high standards"
}


def launch_agent(species, query, sphere_url, ollama_host, model="llama3.2:1b"):
    """
    Launch phi-agent Docker container and stream results.

    Args:
        species: Loadout name (e.g., "wanderer")
        query: Search query
        sphere_url: Sphere API endpoint (e.g., https://sphere-api.render.com)
        ollama_host: Ollama host (e.g., http://host.docker.internal:11434)
        model: LLM model to use

    Yields:
        (status_text, cycle_output, summary_text)
    """
    if not query.strip():
        yield ("❌ Error: Query cannot be empty", "", "")
        return

    if not sphere_url.strip() or not ollama_host.strip():
        yield ("❌ Error: Sphere URL and Ollama Host must be set", "", "")
        return

    yield (f"🚀 Launching {species} agent...", "", "")

    try:
        # Execute phi-agent
        stdout = execute_phi_agent(
            loadout=species,
            query=query,
            sphere_url=sphere_url,
            ollama_host=ollama_host,
            model=model
        )

        yield (f"✅ Execution complete", "", "Parsing output...")

        # Parse cycles
        cycles = parse_cycles(stdout)

        if not cycles:
            yield (
                "⚠️ No cycles parsed from output",
                stdout[-2000:] if len(stdout) > 2000 else stdout,  # Last 2000 chars
                "No structured data found. See raw output above."
            )
            return

        # Format cycle output
        cycle_text = format_cycle_output(cycles)

        # Generate summary
        summary_text = format_summary(cycles, species)

        yield (
            f"✅ {species} completed {len(cycles)} cycles",
            cycle_text,
            summary_text
        )

    except Exception as e:
        yield (f"❌ Error: {str(e)}", "", "")


def create_ui():
    """Create Gradio UI."""

    theme = gr.themes.Default(
        primary_hue="slate",
        neutral_hue="slate",
        font=["system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"]
    )

    css = """
    .gradio-container {
        max-width: 1200px !important;
    }
    .species-card {
        border: 1px solid #e0e0e0;
        padding: 12px;
        border-radius: 4px;
        background: #ffffff;
    }
    """

    with gr.Blocks(title="Explorers — Sphere") as app:

        gr.Markdown("""
        # Explorers

        Launch phi-agent with different **Loadouts** (personality presets) and observe their perception cycles.
        Each species has different **weights**, **quality vectors**, and **return behaviors** — producing distinct exploration patterns.

        **Note**: This UI does NOT implement FastGate or Feelings logic. It only launches phi-agent containers.
        The agent's personality emerges from: `Loadout (vectors) × Physics (Sphere) × Sensor (LLM)`.
        """)

        with gr.Row():
            with gr.Column(scale=1):
                gr.Markdown("## Configuration")

                species_dropdown = gr.Dropdown(
                    choices=SPECIES,
                    value="balanced",
                    label="Species (Loadout)",
                    info="Select personality preset"
                )

                species_info = gr.Textbox(
                    value=SPECIES_DESC["balanced"],
                    label="Description",
                    interactive=False,
                    lines=2
                )

                query_input = gr.Textbox(
                    label="Query",
                    placeholder="e.g., knowledge, AI safety, metabolism",
                    value="knowledge exploration",
                    lines=2
                )

                model_input = gr.Dropdown(
                    choices=["llama3.2:1b"],
                    value="llama3.2:1b",
                    label="Model",
                    info="Ollama model name"
                )

                with gr.Accordion("Advanced Settings", open=False):
                    sphere_url_input = gr.Textbox(
                        label="Sphere API URL",
                        value=os.getenv("SPHERE_URL", "http://localhost:3001"),
                        info="Sphere periphery endpoint"
                    )

                    ollama_host_input = gr.Textbox(
                        label="Ollama Host",
                        value=os.getenv("OLLAMA_HOST", "http://host.docker.internal:11434"),
                        info="Ollama API endpoint accessible from Docker"
                    )

                execute_btn = gr.Button("🚀 Launch Agent", variant="primary", size="lg")

                status_text = gr.Textbox(
                    label="Status",
                    interactive=False,
                    lines=1
                )

            with gr.Column(scale=2):
                gr.Markdown("## Perception Cycles")

                cycle_output = gr.Textbox(
                    label="Cycle-by-Cycle Output",
                    interactive=False,
                    lines=20,
                    max_lines=30
                )

                summary_output = gr.Textbox(
                    label="Summary",
                    interactive=False,
                    lines=8
                )

        # Update species description when dropdown changes
        species_dropdown.change(
            fn=lambda s: SPECIES_DESC.get(s, ""),
            inputs=species_dropdown,
            outputs=species_info
        )

        # Execute button click
        execute_btn.click(
            fn=launch_agent,
            inputs=[
                species_dropdown,
                query_input,
                sphere_url_input,
                ollama_host_input,
                model_input
            ],
            outputs=[status_text, cycle_output, summary_output]
        )

        gr.Markdown("""
        ---
        ### How It Works

        1. **Select Species**: Each loadout has different personality vectors
        2. **Enter Query**: Agent uses this as its search intent
        3. **Launch**: UI spawns phi-agent Docker container
        4. **Observe**: Real-time display of sense/focus/evaluate cycles

        **Architecture**: `UI → phi-agent (Docker) → Sphere API`

        **Data Access**: Displays L2 (tags + summary) only. Content (L3) stays in Sphere.
        """)

    return app, theme, css


if __name__ == "__main__":
    app, theme, css = create_ui()
    app.launch(
        server_name="0.0.0.0",
        server_port=7860,
        share=False,
        theme=theme,
        css=css
    )
