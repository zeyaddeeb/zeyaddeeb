import "./reserved-text.css";

// Measure every wording in the same grid cell, including the hidden alternatives.
// Live text can then update without moving nearby content.
export function ReservedText({
	text,
	samples,
}: {
	text: string;
	samples: readonly string[];
}) {
	return (
		<span className="reserved-text">
			{samples.map((sample) => (
				<span className="reserved-text__sample" aria-hidden="true" key={sample}>
					{sample}
				</span>
			))}
			<span>{text}</span>
		</span>
	);
}
