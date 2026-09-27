export function drawBars(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	data: Float32Array,
) {
	const barWidth = width / data.length;
	const barGap = 2;
	const maxHeight = height * 0.8;

	for (let i = 0; i < data.length; i++) {
		const barHeight = data[i] * maxHeight;
		const x = i * barWidth;
		const y = height - barHeight;

		const gradient = ctx.createLinearGradient(x, y, x, height);
		const hue = (i / data.length) * 60 + 260;
		gradient.addColorStop(0, `hsla(${hue}, 80%, 60%, 0.9)`);
		gradient.addColorStop(1, `hsla(${hue + 30}, 80%, 40%, 0.3)`);

		ctx.fillStyle = gradient;
		ctx.fillRect(x + barGap / 2, y, barWidth - barGap, barHeight);

		ctx.shadowColor = `hsla(${hue}, 80%, 60%, 0.5)`;
		ctx.shadowBlur = 15;
		ctx.fillRect(x + barGap / 2, y, barWidth - barGap, barHeight);
		ctx.shadowBlur = 0;
	}
}

export function drawWave(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	data: Float32Array,
) {
	const sliceWidth = width / data.length;
	const centerY = height / 2;

	ctx.beginPath();
	ctx.moveTo(0, centerY);

	for (let i = 0; i < data.length; i++) {
		const x = i * sliceWidth;
		const amplitude = data[i] * (height / 3);
		const y = centerY - amplitude;

		if (i === 0) {
			ctx.moveTo(x, y);
		} else {
			const prevX = (i - 1) * sliceWidth;
			const cpX = (prevX + x) / 2;
			ctx.quadraticCurveTo(
				prevX,
				centerY - data[i - 1] * (height / 3),
				cpX,
				(centerY - data[i - 1] * (height / 3) + y) / 2,
			);
		}
	}

	ctx.lineTo(width, centerY);
	ctx.lineTo(0, centerY);
	ctx.closePath();

	const gradient = ctx.createLinearGradient(0, 0, width, 0);
	gradient.addColorStop(0, "rgba(139, 92, 246, 0.4)");
	gradient.addColorStop(0.5, "rgba(236, 72, 153, 0.4)");
	gradient.addColorStop(1, "rgba(139, 92, 246, 0.4)");
	ctx.fillStyle = gradient;
	ctx.fill();

	ctx.beginPath();
	for (let i = 0; i < data.length; i++) {
		const x = i * sliceWidth;
		const amplitude = data[i] * (height / 3);
		const y = centerY - amplitude;

		if (i === 0) {
			ctx.moveTo(x, y);
		} else {
			ctx.lineTo(x, y);
		}
	}

	const lineGradient = ctx.createLinearGradient(0, 0, width, 0);
	lineGradient.addColorStop(0, "rgb(139, 92, 246)");
	lineGradient.addColorStop(0.5, "rgb(236, 72, 153)");
	lineGradient.addColorStop(1, "rgb(139, 92, 246)");
	ctx.strokeStyle = lineGradient;
	ctx.lineWidth = 3;
	ctx.stroke();

	ctx.beginPath();
	for (let i = 0; i < data.length; i++) {
		const x = i * sliceWidth;
		const amplitude = data[i] * (height / 4);
		const y = centerY + amplitude;

		if (i === 0) {
			ctx.moveTo(x, y);
		} else {
			ctx.lineTo(x, y);
		}
	}
	ctx.strokeStyle = "rgba(139, 92, 246, 0.3)";
	ctx.lineWidth = 2;
	ctx.stroke();
}

export function drawCircular(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	data: Float32Array,
) {
	const centerX = width / 2;
	const centerY = height / 2;
	const baseRadius = Math.min(width, height) * 0.2;
	const maxRadius = Math.min(width, height) * 0.4;

	for (let i = 0; i < data.length; i++) {
		const angle = (i / data.length) * Math.PI * 2 - Math.PI / 2;
		const radius = baseRadius + data[i] * (maxRadius - baseRadius);

		const x1 = centerX + Math.cos(angle) * baseRadius;
		const y1 = centerY + Math.sin(angle) * baseRadius;
		const x2 = centerX + Math.cos(angle) * radius;
		const y2 = centerY + Math.sin(angle) * radius;

		const hue = (i / data.length) * 60 + 260;

		ctx.beginPath();
		ctx.moveTo(x1, y1);
		ctx.lineTo(x2, y2);
		ctx.strokeStyle = `hsla(${hue}, 80%, 60%, ${0.3 + data[i] * 0.7})`;
		ctx.lineWidth = 4;
		ctx.lineCap = "round";
		ctx.stroke();

		ctx.beginPath();
		ctx.arc(x2, y2, 3 + data[i] * 5, 0, Math.PI * 2);
		ctx.fillStyle = `hsla(${hue}, 80%, 70%, ${0.5 + data[i] * 0.5})`;
		ctx.shadowColor = `hsla(${hue}, 80%, 60%, 0.8)`;
		ctx.shadowBlur = 10;
		ctx.fill();
		ctx.shadowBlur = 0;
	}

	const avgIntensity =
		Array.from(data).reduce((a, b) => a + b, 0) / data.length;
	ctx.beginPath();
	ctx.arc(
		centerX,
		centerY,
		baseRadius * 0.8 + avgIntensity * 20,
		0,
		Math.PI * 2,
	);
	const gradient = ctx.createRadialGradient(
		centerX,
		centerY,
		0,
		centerX,
		centerY,
		baseRadius,
	);
	gradient.addColorStop(0, "rgba(139, 92, 246, 0.3)");
	gradient.addColorStop(1, "rgba(139, 92, 246, 0)");
	ctx.fillStyle = gradient;
	ctx.fill();
}

export function drawParticles(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	data: Float32Array,
) {
	const centerX = width / 2;
	const centerY = height / 2;
	const time = Date.now() * 0.001;

	for (let i = 0; i < data.length; i++) {
		const intensity = data[i];
		const numParticles = Math.floor(3 + intensity * 10);

		for (let j = 0; j < numParticles; j++) {
			const angle = (i / data.length) * Math.PI * 2 + time + j * 0.5;
			const distance = 50 + intensity * 200 + j * 20;
			const x = centerX + Math.cos(angle) * distance;
			const y = centerY + Math.sin(angle) * distance;
			const size = 2 + intensity * 6;

			const hue = (i / data.length) * 60 + 260;
			ctx.beginPath();
			ctx.arc(x, y, size, 0, Math.PI * 2);
			ctx.fillStyle = `hsla(${hue}, 80%, 60%, ${0.3 + intensity * 0.5})`;
			ctx.shadowColor = `hsla(${hue}, 80%, 60%, 0.8)`;
			ctx.shadowBlur = 15;
			ctx.fill();
		}
	}

	ctx.shadowBlur = 0;

	const avgIntensity =
		Array.from(data).reduce((a, b) => a + b, 0) / data.length;
	const pulseRadius = 30 + avgIntensity * 50 + Math.sin(time * 3) * 10;

	const gradient = ctx.createRadialGradient(
		centerX,
		centerY,
		0,
		centerX,
		centerY,
		pulseRadius,
	);
	gradient.addColorStop(0, `rgba(236, 72, 153, ${0.4 + avgIntensity * 0.4})`);
	gradient.addColorStop(1, "rgba(236, 72, 153, 0)");

	ctx.beginPath();
	ctx.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
	ctx.fillStyle = gradient;
	ctx.fill();
}
