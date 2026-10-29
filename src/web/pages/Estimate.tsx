import type { CalcResult } from "../../shared/calc";
import { chf } from "../../shared/money";
import type { EstimateRow, TaxData } from "../../shared/types";
import { Callout, Card } from "../components/Fields";

function format(r: EstimateRow) {
  switch (r.format) {
    case "chf2":
      return chf(r.value, 2);
    case "number":
      return String(r.value);
    case "percent":
      return `${r.value.toFixed(4)} %`;
    default:
      return chf(r.value);
  }
}

function Row({ row }: { row: EstimateRow }) {
  return (
    <tr className={row.strong ? "strong" : ""}>
      <td>
        {row.label}
        {row.sub && <div className="muted small">{row.sub}</div>}
      </td>
      <td className="num">{format(row)}</td>
    </tr>
  );
}

export function Estimate({ data, result }: { data: TaxData; result: CalcResult }) {
  const { cantonTotal, cantonSections, ifd, total } = result.estimate;
  const zh = data.canton === "ZH";
  return (
    <>
      <div className="page-intro">
        <h2>Tax estimate 2025</h2>
        <p className="muted">
          Computed with the official 2025 tariffs. Use it to check that {zh ? "your provisional bill" : "VaudTax's result"} is in the same range, and to decide
          whether to pay extra before the deadline to limit interest.
        </p>
      </div>

      <div className="total-tiles">
        <div className="tile">
          <span>{zh ? "State, communal" + (cantonSections.some((s) => s.rows.some((r) => r.label.startsWith("Church"))) ? ", church" : "") + " & personal" : "Cantonal + communal"}</span>
          <strong>{chf(cantonTotal, 2)}</strong>
        </div>
        <div className="tile">
          <span>Federal</span>
          <strong>{chf(ifd.total, 2)}</strong>
        </div>
        <div className="tile accent">
          <span>Total</span>
          <strong>{chf(total, 2)}</strong>
        </div>
      </div>

      {cantonSections.map((s) => (
        <Card key={s.title} title={s.title}>
          <table className="table">
            <tbody>
              {s.rows.map((r) => (
                <Row key={r.label} row={r} />
              ))}
            </tbody>
          </table>
        </Card>
      ))}

      <Card title="Federal income tax (direct federal tax)">
        <table className="table">
          <tbody>
            <Row row={{ label: "Taxable income (federal rules)", value: ifd.taxableIncome }} />
            <Row row={{ label: "Tax per federal scale", value: ifd.tax, format: "chf2" }} />
            {ifd.childRebate > 0 && <Row row={{ label: "− CHF 263 per child (parental scale)", value: ifd.childRebate, format: "chf2" }} />}
            <Row row={{ label: "Federal tax", value: ifd.total, format: "chf2", strong: true }} />
          </tbody>
        </table>
      </Card>

      <Callout tone="warn">
        This is an estimate, not a tax decision. It doesn't cover capital payouts taxed separately, special cases for self-employment, or partial years
        (moving to or from Switzerland during 2025).{zh ? "" : " Vaud has no church tax."} Withholding tax refunds are credited separately on your final bill.
      </Callout>
    </>
  );
}
