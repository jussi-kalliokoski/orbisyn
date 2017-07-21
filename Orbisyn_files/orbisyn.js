window.console && console.profile && console.profile() && setTimeout(function(){ console.profileEnd(); }, 5000);

(function(global, Jin){
var	dev,
	VCOamount	= 4,
	sampleRate	= 44100,
	midiHandler	= new audioLib.MidiEventTracker(),
	decays		= [],
	delays		= [],
	filters		= [],
	choruses	= [],
	capper,
	volENV, fltENV,
	LFO, LFOvalue,
	stepSeq,

	stepSeqAmount,

	oscControls,
	oscPulseWidth = [],

	create		= Jin.create,
	byId		= Jin.byId,
	byTag		= Jin.byTag,
	bind		= Jin.bind;

midiHandler.polyphony = 16;

function audioProcess(buffer){
	var	i, n, l		= buffer.length,
		noisePhase,
		sampleLeft, sampleRight,
		stepSeqAm	= stepSeqAmount.value;
	for (i=0; i<l; i++){
		noisePhase = (Math.random() * 2 - 1);
		LFO.generate();
		volENV.generate();
		fltENV.generate();
		stepSeq.generate();
		LFOvalue = LFO.getMix() * 0.4 + 1;
		filters[0].cutoff = filters[1].cutoff = 17000 * (fltENV.value * 0.8 + 0.01);
		sampleLeft = 0.0;

		for (n=0; n<midiHandler.voices.length; n++){
			sampleLeft += midiHandler.voices[n].process(noisePhase * 0.3, midiHandler.pitchBend * 0.121481);
		}

		for (n=0; n<decays.length; n++){
			sampleLeft += decays[n].process(noisePhase * 0.3, midiHandler.pitchBend * 0.121481);
		}

		sampleLeft = capper.pushSample(sampleLeft);

		sampleLeft *= 0.2 * volENV.value;
		sampleLeft = sampleLeft * (1 - stepSeqAm) + sampleLeft * stepSeq.value * stepSeqAm;

		sampleRight = sampleLeft;

		sampleLeft	= filters[0].pushSample(sampleLeft);
		sampleRight	= filters[1].pushSample(sampleRight);

		sampleLeft	+= choruses[0].pushSample(sampleLeft) * 0.5;
		sampleRight	+= choruses[1].pushSample(sampleRight) * 0.5;

		sampleLeft	+= delays[0].pushSample(sampleLeft * 0.5);
		sampleRight	+= delays[1].pushSample(sampleRight * 0.5);

		buffer[i++] = sampleLeft * 0.5;
		buffer[i] = sampleRight * 0.5;
	}
}

function gateClose(){
	volENV.triggerGate(false);
	fltENV.triggerGate(false);
}

function gateOpen(){
	volENV.triggerGate(true);
	fltENV.triggerGate(true);
	stepSeq.triggerGate();
}

function assignDevice(){
	audioLib.AudioDevice.dummy = true;
	dev = new audioLib.AudioDevice(audioProcess, 2, undefined, sampleRate);
	sampleRate = dev.sampleRate;
	if (dev.type === 'dummy'){
		alert('Failed to create an audio device. If you\'re using chrome (10+) or safari, please check that you\'ve enabled the flag for AudioContext. If you are using Firefox, please update to the latest version of the 4 branch.');
	}

	global.onmidi = (...args) => console.log(...args) || midiHandler.listener(...args)

	midiHandler.voice = function(){
    console.log('???')
		if (!midiHandler.voices.length){
			gateOpen();
		}
		var	VCOs		= [],
			decayTimer, fullDecay,
			decaying	= false,
			i;
		var decay = 500;

		for (i=0; i<VCOamount; i++){
			VCOs.push( new audioLib.Oscillator(sampleRate, this.getFrequency() ) );
			VCOs[i].waveShape = i;
		}

		this.onKeyChange = function(){
			var i;
			for (i=0; i<VCOamount; i++){
				VCOs[i].frequency = this.getFrequency();
			}
		}

		this.process = function(){
			var i, factor = 1, mix = 0.0;
			if (decaying && --decayTimer <= 0){
				for (i=0; i<decays.length; i++){
					if (decays[i] === this){
						decays.splice(i--, 1);
					}
				}
			}

			if (decaying){
				factor = decayTimer / fullDecay;
			}

			for (i=0; i<VCOamount; i++){
//				VCOs[i].pulseWidth = oscPulseWidth[i].value; // You make me slow... :(
				VCOs[i].generate.apply(VCOs[i], arguments);
				mix += VCOs[i].getMix() * this.velocity * factor;
			}
			return mix;
		}

		this.noteOff = function(){
			decayTimer = Math.floor(sampleRate / 1000 * decay);
			fullDecay = decayTimer+1;
			decaying = true;
			decays.push(this);
			if (midiHandler.voices.length === 1){
				gateClose();
			}
		}
	};

	delays = [new audioLib.Delay(sampleRate), new audioLib.Delay(sampleRate)];
	delays[0].feedback = delays[1].feedback = 0.5;
	delays[1].time = 690;
	filters = [new audioLib.LP12Filter(sampleRate, 500, 8), new audioLib.LP12Filter(sampleRate, 500, 8)];
	choruses = [new audioLib.Chorus(sampleRate, 30, 5, 0.3), new audioLib.Chorus(sampleRate, 30, 5, 0.3)];
	LFO = new audioLib.Oscillator(sampleRate);
	LFO.frequency = 0.5;
	volENV = new audioLib.ADSREnvelope(sampleRate, 1000, 1000, 0.7, 1000);
	fltENV = new audioLib.ADSREnvelope(sampleRate, 4000, 1900, 0.8, 1000);
							//	1           2           3           4
	stepSeq = new audioLib.StepSequencer(sampleRate, 30, [	1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0,
							//	1           2           3           4
								0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0], 0.1); // Heh, makes sense, right?
	capper = new audioLib.Capper(sampleRate, 0.3);
}

function buildControlArea(id, title){
	var controlarea = {
		dom: create({'class': 'controlarea', id: id}),
		tabs: create({'class': 'title'}),
		shadow: create({'class': 'container'})
	};
	Jin.appendChildren(controlarea.dom, controlarea.tabs, controlarea.shadow);
	controlarea.tabs.innerHTML = title;
	Jin.appendChildren(document.body, controlarea.dom);
	return controlarea;
}

function buildOscillators(){
	var i;
	oscControls = buildControlArea('oscillators', 'Oscillators');
	for (i=0; i<VCOamount; i++){
		oscPulseWidth.push(Jin.dial());
		Jin.appendChildren(oscControls.shadow, oscPulseWidth[i].dom);
	}
}

function buildStepSequencer(){
	var	stepSeqUI	= buildControlArea('stepsequencer', 'Step Sequencer'),
		i, elem,
		amountDiv	= create({'html': 'Amount:<br/>'}),
		sequenceDiv	= create({'html': 'Sequence:<br/>'});
	Jin.appendChildren(stepSeqUI.shadow, amountDiv, sequenceDiv);
	stepSeqAmount	= Jin.dial();
	amountDiv.appendChild(stepSeqAmount.dom);
	stepSeqAmount.value = 1;
	for (i=0; i<stepSeq.steps.length; i++){
		elem = create('input', {type: 'checkbox'});
		if (stepSeq.steps[i]){
			elem.setAttribute('checked', 'checked');
		}
		sequenceDiv.appendChild(elem);
		bind(elem, 'change', function(e){ stepSeq.steps[e.data.i] = this.checked * 1; }, {i: i});
	}
}

function createHCUI(){
	var	toggler		= create({id: 'uitoggle'}),
		label		= create('label', {'for': 'uicheck'}),
		check		= create('input', {type: 'checkbox', id: 'uicheck'}),
		coolness	= Jin.dynamicCss('.slider .control, .window, .controlarea, .controlarea .container, input[type=checkbox]', {'$box-shadow': '0px 0px 10px rgba(255,255,255,0.7), 0px 0px 10px rgba(0,0,0,0.7) inset'}),
		head		= byTag('head')[0];
	Jin.appendChildren(toggler, label, check);
	Jin.appendChildren(document.body, toggler);
	head.removeChild(coolness);
	label.innerHTML = 'Enable coolness (recommended only for hypercomputers)';
	bind(check, 'change', function(){
		if (this.checked){
			head.appendChild(coolness);
		} else {
			head.removeChild(coolness);
		}
	});
}

function buildUI(){
	buildOscillators();
	buildStepSequencer();
	createHCUI();
}

Jin(function(){
	assignDevice();
	buildUI();
});

}(this, Jin));
