"""Who to notify about a move. Plain assembly from the profile and the plan: no
model is involved, so the list always works. The letters themselves are built
in the browser, because names and addresses are not sent to the server."""

from typing import Any

from app.states import state_name

Profile = dict[str, Any]
Task = dict[str, Any]


def _first(tasks: list[Task], matches) -> Task | None:
    return next((task for task in tasks if matches(task)), None)


def build_notify_list(profile: Profile, tasks: list[Task]) -> list[dict[str, Any]]:
    destination = state_name(profile.get("destinationState"))
    items: list[dict[str, Any]] = []

    def add(**item: Any) -> None:
        # Optional fields (link, ruleId, letter) are left out when empty.
        items.append({key: value for key, value in item.items() if value is not None})

    def link(task: Task | None) -> dict[str, str] | None:
        return {"name": task["source"]["name"], "url": task["source"]["url"]} if task else None

    def rule_id(task: Task | None) -> str | None:
        return task["ruleId"] if task else None

    add(
        id="usps",
        who="US Postal Service",
        why="Mail sent to your old address is forwarded while everyone else catches up.",
        how="File a change of address online or at a post office.",
        link={"name": "USPS — Change of address", "url": "https://www.usps.com/manage/forward.htm"},
    )

    irs = _first(tasks, lambda t: t["ruleId"] == "US-TAX-8822")
    if irs:
        add(
            id="irs",
            who="IRS",
            why="Notices and refunds go to the address the IRS has on file.",
            how="Mail Form 8822.",
            link=link(irs),
            ruleId=irs["ruleId"],
        )

    if profile.get("employment") == "employee" or profile.get("income") in ("w2", "both"):
        de4 = _first(tasks, lambda t: t["ruleId"] == "CA-TAX-DE4")
        add(
            id="employer",
            who="Your employer's payroll or HR team",
            why=f"State tax withholding follows where you live and work. {destination} may need its own withholding form.",
            how="Send your new address and hand in the state withholding form from your plan."
            if de4 else "Send your new address and ask which state forms they need.",
            ruleId=rule_id(de4),
            letter="address_change",
        )

    insurance = profile.get("insurance")
    if insurance and insurance != "none":
        task = _first(tasks, lambda t: t["category"] == "health")
        who = {
            "employer": "Your health plan (through HR)",
            "marketplace": "The health insurance Marketplace",
            "medicaid": "Your state Medicaid office",
        }.get(insurance, "Your health insurer")
        add(
            id="health",
            who=who,
            why="Plans and provider networks are tied to where you live. A move between states usually means a new plan or a network check.",
            how=f"See “{task['title']}” in your plan." if task else "Report the move and ask what changes.",
            link=link(task),
            ruleId=rule_id(task),
            letter="address_change" if insurance == "other" else None,
        )

    if profile.get("hasVehicle") is not False:
        auto = _first(tasks, lambda t: t["ruleId"].endswith("VEH-INSURANCE"))
        add(
            id="auto-insurer",
            who="Your auto insurer",
            why="The policy is rated for where the car is kept, and the new state sets its own minimum coverage.",
            how="Give them the move date and the new garaging address.",
            ruleId=rule_id(auto),
            letter="auto_insurer",
        )
        dmv = _first(
            tasks,
            lambda t: t["ruleId"].endswith("VEH-REG") or t["ruleId"].endswith("VEH-DL") or t["ruleId"] == "US-VEH-STATE-CHECK",
        )
        if dmv:
            add(
                id="dmv",
                who=f"{destination} motor vehicle agency",
                why="A new resident has to move the license and registration over.",
                how=f"See “{dmv['title']}” in your plan.",
                link=link(dmv),
                ruleId=dmv["ruleId"],
            )

    add(
        id="bank",
        who="Banks, credit cards and lenders",
        why="Statements, replacement cards and fraud checks use your address.",
        how="Update it in each online account, or send a letter where that is not possible.",
        letter="address_change",
    )

    add(
        id="landlord",
        who="Your current landlord or property manager",
        why="Your lease sets how much notice you owe and where the deposit is sent.",
        how="Give written notice with a forwarding address. Check the notice period in your lease first.",
        letter="landlord_notice",
    )

    add(
        id="utilities",
        who="Utilities, internet and phone",
        why="Service has to stop at the old place on the day you leave and start at the new one.",
        how="Schedule the stop and start dates with each provider.",
    )

    if profile.get("hasChildren"):
        school = _first(tasks, lambda t: t["category"] == "family")
        add(
            id="school",
            who="Your children's current school",
            why="The new school asks for records and immunization history.",
            how="Request the records in writing before the move.",
            ruleId=rule_id(school),
            letter="school_records",
        )

    add(
        id="voter",
        who="Voter registration",
        why="Registration does not move with you. You register again in the new state.",
        how="Start from the federal voter registration site.",
        link={"name": "vote.gov", "url": "https://vote.gov"},
    )

    add(
        id="medical",
        who="Doctors, dentist and pharmacy",
        why="Records and prescriptions are easier to transfer before you leave.",
        how="Ask for records and move open prescriptions to a pharmacy near the new address.",
    )

    return items


def notify_list_text(items: list[dict[str, Any]], profile: Profile) -> str:
    """A plain-text version of the list, for copying or printing."""
    title = f"Who to notify: {state_name(profile.get('currentState'))} to {state_name(profile.get('destinationState'))}"
    lines = []
    for index, item in enumerate(items, start=1):
        url = f"\n   {item['link']['url']}" if item.get("link") else ""
        lines.append(f"{index}. {item['who']}\n   Why: {item['why']}\n   How: {item['how']}{url}")
    return f"{title}\n\n" + "\n\n".join(lines) + "\n"
