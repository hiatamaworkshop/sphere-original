"""
Explorers — Gradio UI (HF Spaces Edition)

Demo site for external users to send agents into Sphere and experience
the generation system. Single-run only, no daemon.

Architecture:
  UI (Gradio) → executor_subprocess.py (Node.js) → phi-agent → Sphere API (Render)
"""

import gradio as gr
import os
import json
import requests
from pathlib import Path
from executor_subprocess import execute_phi_agent, check_node_available, check_phi_agent_built
from parser import parse_cycles, format_cycle_output, format_summary, format_combined_output, extract_narrative
import plotly.graph_objects as go
from plotly.subplots import make_subplots

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
    "balanced": "Generalist -- even weights, explore mode",
    "scholar": "Deep reader -- high weight sensitivity, deep mode",
    "scout": "Quick surveyor -- fast return, explore mode",
    "archivist": "Preservationist -- loves Amber (frozen) nodes",
    "hunter": "Heat seeker -- chases high-heat areas",
    "moth": "Heat generator -- evaluates everything as hot",
    "hermit": "Stability seeker -- avoids crowds, deep mode",
    "wanderer": "Exhaustive explorer -- never returns until energy is gone",
    "sniper": "Selective evaluator -- harsh scorer, high standards"
}

# HF Inference API models (free tier only)
HF_MODELS = [
    "HuggingFaceTB/SmolLM3-3B",  # 3B, free tier, 0.11s latency, tools support
]

SPHERE_URL = os.getenv("SPHERE_URL", "http://localhost:3001")


def wake_sphere(sphere_url: str) -> str:
    """
    Ping Sphere to wake it from Render cold start.
    Render free tier sleeps after 15min inactivity; first request takes 30-60s.
    """
    try:
        res = requests.get(f"{sphere_url}/health", timeout=90)
        if res.ok:
            return "Sphere is awake and ready."
        return f"Sphere responded with status {res.status_code}."
    except requests.exceptions.Timeout:
        return "Sphere is starting up (cold start). Please try again in 30 seconds."
    except requests.exceptions.ConnectionError:
        return "Cannot connect to Sphere. Check SPHERE_URL."
    except Exception as e:
        return f"Wake-up error: {str(e)}"


def load_generations(max_gens=10):
    """
    Load latest N generations from bundled data.

    Returns:
        List of generation dictionaries (sorted newest first)
    """
    phi_agent_dir = os.environ.get("PHI_AGENT_DIR", "/app/phi-agent")
    gen_dir = Path(phi_agent_dir) / "data" / "generations"
    if not gen_dir.exists():
        return []

    files = sorted(gen_dir.glob("gen-*.json"), reverse=True)
    generations = []

    for f in files[:max_gens]:
        try:
            with open(f) as fp:
                generations.append(json.load(fp))
        except Exception:
            continue

    return generations


def visualize_generations():
    """
    Load generations and create visualization.

    Returns:
        (info_text, species_plot, timeline_plot)
    """
    gens = load_generations()

    if not gens:
        return "No generation data found. Bundled gen-data may not be present.", None, None

    latest = gens[0]

    # Generate info text
    info_text = f"""### Generation {latest['generation']}
**Timestamp**: {latest['timestamp']}
**Hunger**: {latest['hunger']:.2f}
**Evaluations**: {latest['inputEvaluations']} -> {latest['survivedEvaluations']} survived ({latest['survivedEvaluations']/latest['inputEvaluations']*100:.1f}%)
"""

    # Create species comparison plot (latest generation)
    species_names = list(latest['species'].keys())
    species_data = [latest['species'][name] for name in species_names]

    fig_species = make_subplots(
        rows=2, cols=1,
        subplot_titles=("Average Scores (h/w/d)", "Evaluation Counts"),
        vertical_spacing=0.15
    )

    # Row 1: Scores
    fig_species.add_trace(
        go.Bar(name='avgH', x=species_names, y=[d['avgH'] for d in species_data]),
        row=1, col=1
    )
    fig_species.add_trace(
        go.Bar(name='avgW', x=species_names, y=[d['avgW'] for d in species_data]),
        row=1, col=1
    )
    fig_species.add_trace(
        go.Bar(name='avgD', x=species_names, y=[d['avgD'] for d in species_data]),
        row=1, col=1
    )

    # Row 2: Evaluation counts
    fig_species.add_trace(
        go.Bar(name='Evaluations', x=species_names, y=[d['evaluations'] for d in species_data], marker_color='lightblue'),
        row=2, col=1
    )

    fig_species.update_layout(
        height=600,
        title_text=f"Species Comparison (Generation {latest['generation']})",
        showlegend=True
    )

    fig_species.update_xaxes(title_text="Species", row=2, col=1)
    fig_species.update_yaxes(title_text="Score", row=1, col=1)
    fig_species.update_yaxes(title_text="Count", row=2, col=1)

    # Create timeline plot (if multiple generations exist)
    timeline_plot = None
    if len(gens) > 1:
        # Sort chronologically
        gens_sorted = sorted(gens, key=lambda g: g['generation'])

        fig_timeline = go.Figure()

        # Plot avgH for each species over generations
        for species in species_names:
            gen_nums = [g['generation'] for g in gens_sorted]
            avgH = [g['species'][species]['avgH'] for g in gens_sorted if species in g['species']]

            fig_timeline.add_trace(go.Scatter(
                x=gen_nums,
                y=avgH,
                mode='lines+markers',
                name=f"{species} (H)"
            ))

        fig_timeline.update_layout(
            title="Species avgH Evolution Over Generations",
            xaxis_title="Generation",
            yaxis_title="avgH",
            height=400
        )

        timeline_plot = fig_timeline

    return info_text, fig_species, timeline_plot


def launch_agent(species, query, model, sphere_url, evaluate=True):
    """
    Launch phi-agent subprocess and stream results.

    Args:
        species: Loadout name (e.g., "wanderer")
        query: Search query
        model: HF model ID
        sphere_url: Sphere API endpoint
        evaluate: Whether to evaluate nodes (write back to Sphere)

    Yields:
        (status_text, narrative_output, combined_output)
    """
    if not query.strip():
        yield ("Error: Query cannot be empty", "*No narrative*", "")
        return

    if not sphere_url.strip():
        yield ("Error: Sphere URL must be set", "*No narrative*", "")
        return

    eval_label = "evaluate ON" if evaluate else "observe only"
    yield (f"Waking up Sphere (Render cold start may take 30-60s)...", "*Waiting for Sphere...*", "")

    # Wake Sphere first
    wake_result = wake_sphere(sphere_url)
    if "Cannot connect" in wake_result or "error" in wake_result.lower():
        yield (f"Sphere unavailable: {wake_result}", "*Cannot proceed without Sphere*", "")
        return

    yield (f"Launching {species} agent ({eval_label})...", f"*{wake_result} Agent is exploring... (may take 2-4 minutes)*", "")

    try:
        stdout = execute_phi_agent(
            loadout=species,
            query=query,
            sphere_url=sphere_url,
            model=model,
            evaluate=evaluate
        )

        yield ("Execution complete", "*Parsing output...*", "Parsing output...")

        # Parse cycles
        cycles = parse_cycles(stdout)

        if not cycles:
            yield (
                "No cycles parsed from output",
                "*No narrative generated*",
                stdout[-2000:] if len(stdout) > 2000 else stdout
            )
            return

        combined = format_combined_output(cycles, species)

        yield (
            f"{species} completed {len(cycles)} cycles",
            "*Generating narrative...*",
            combined
        )

        narrative = extract_narrative(stdout)

        yield (
            f"{species} completed {len(cycles)} cycles",
            narrative,
            combined
        )

    except Exception as e:
        yield (f"Error: {str(e)}", "*Error occurred*", "")


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
    """

    with gr.Blocks(title="Explorers -- Sphere") as app:

        gr.Markdown("""
        # Explorers -- Sphere

        Send agents with different personalities (Loadouts) into a living information ecosystem.
        Each species perceives and evaluates information differently -- personality emerges from:
        **Loadout (vectors) x Physics (Sphere) x Sensor (LLM)**.

        *First request may take 30-60s as Sphere wakes up from sleep.*
        """)

        with gr.Tabs():
            # Agent Tab
            with gr.Tab("Agent"):
                with gr.Row():
                    with gr.Column(scale=1):
                        gr.Markdown("## Configuration")

                        query_input = gr.Textbox(
                            label="Query",
                            placeholder="e.g., journey, quantum physics, cultural traditions",
                            value="knowledge exploration",
                            lines=2,
                            max_lines=4,
                            max_length=500
                        )

                        model_input = gr.Dropdown(
                            choices=HF_MODELS,
                            value=HF_MODELS[0],
                            label="Model",
                            info="HuggingFace Inference API model"
                        )

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

                        evaluate_checkbox = gr.Checkbox(
                            value=True,
                            label="Evaluate nodes",
                            info="Write evaluations to Sphere. OFF = observe + narrative only (faster)"
                        )

                        with gr.Accordion("Advanced Settings", open=False):
                            sphere_url_input = gr.Textbox(
                                label="Sphere API URL",
                                value=SPHERE_URL,
                                info="Sphere backend (Render)",
                                max_length=200
                            )

                        execute_btn = gr.Button("Launch Agent", variant="primary", size="lg")

                        gr.Markdown("*Execution takes 2-4 minutes (sense/focus/evaluate + narrative)*")

                        status_text = gr.Textbox(
                            label="Status",
                            interactive=False,
                            lines=1
                        )

                    with gr.Column(scale=2):
                        gr.Markdown("## Agent Experience")

                        narrative_output = gr.Markdown(
                            label="Return Narrative",
                            value="*Agent will narrate its experience after return...*",
                        )

                        combined_output = gr.Textbox(
                            label="Cycle & Statistics",
                            interactive=False,
                            lines=20,
                            max_lines=20
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
                        model_input,
                        sphere_url_input,
                        evaluate_checkbox
                    ],
                    outputs=[status_text, narrative_output, combined_output]
                )

                gr.Markdown("""
                ---
                ### How It Works

                1. **Select Species**: Each loadout has different personality vectors
                2. **Enter Query**: Agent uses this as its search intent
                3. **Launch**: Spawns phi-agent into the Sphere ecosystem
                4. **Observe**: Sense/focus/evaluate cycles and return narrative

                **Architecture**: `UI -> phi-agent (subprocess) -> Sphere API (Render)`

                The agent's personality is NOT in the LLM -- it emerges from the Loadout
                (measurement instrument) interacting with Sphere's physics. Like ants: simple
                brains + pheromone trails = complex collective behavior.
                """)

            # Generations Tab
            with gr.Tab("Generations"):
                gr.Markdown("""
                ## Species Memory Evolution

                Visualize how species profiles evolved through the Digestor's metabolic cycle.
                Each generation shows evaluation scores, survival rates, and species divergence.
                """)

                refresh_btn = gr.Button("Refresh Data", variant="secondary")

                gen_info = gr.Markdown()

                with gr.Row():
                    with gr.Column():
                        gr.Markdown("### Species Comparison (Latest Generation)")
                        species_plot = gr.Plot()

                    with gr.Column():
                        gr.Markdown("### Evolution Timeline")
                        timeline_plot = gr.Plot()

                # Refresh button click
                refresh_btn.click(
                    fn=visualize_generations,
                    outputs=[gen_info, species_plot, timeline_plot]
                )

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
