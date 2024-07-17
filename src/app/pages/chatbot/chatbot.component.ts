import { CommonModule } from '@angular/common';
import { AfterViewChecked, Component, ElementRef, ViewChild, NgZone } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';

//Definir la interface Message (declarar variables y tipos de datos)
interface Message {
  text: string;
  isUser: boolean;
  timestamp: string;
  role: 'user' | 'assistant' | 'system';
  isAudio?: boolean;
  audioUrl?: string;
  transcription?: string;
  showTranscription?: boolean;
  isImage?: boolean;
  imageUrl?: string;
}
@Component({
  selector: 'app-chatbot',
  templateUrl: './chatbot.component.html',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styleUrls: ['./chatbot.component.css'],
})
export class ChatBotComponent implements AfterViewChecked {
  //viewchild para manejar que el scroll se haga automaticamente cuando se agregue un nuevo mensaje
  @ViewChild('chatMessages') private chatMessagesContainer!: ElementRef;

  //arreglo de mensajes del asistente
  messages: Message[] = [
    {
      text: 'Hola, ¿En qué puedo ayudarte?',
      isUser: false,
      timestamp: this.getCurrentTimestamp(),
      role: 'assistant',
    },
  ];
  newMessage = '';
  isDragging = false; 
  isRecording = false; // variable para controlar el estado de grabación
  isLoading = false; // variable para controlar el estado de carga
  private shouldScrollToBottom = false;
  private mediaRecorder: MediaRecorder | null = null; // variable para el objeto de grabación
  private audioChunks: Blob[] = []; // arreglo para almacenar los fragmentos de audio

  //llave de API
  private readonly apiKey =
    'INSERTE_TU_API_KEY';
  private readonly apiUrl = 'https://api.openai.com/v1';
  private readonly apiModelUrl = 'http://127.0.0.1:5000';

  //con NgZone nos aseguramos de que Angular detecte los cambios y actualice la vista
  constructor(private http: HttpClient, private ngZone: NgZone) {}

  //metodo para manejar el scroll
  ngAfterViewChecked() {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
    }
  }

  //metodo para hacer scroll
  scrollToBottom(): void {
    try {
      this.chatMessagesContainer.nativeElement.scrollTop =
        this.chatMessagesContainer.nativeElement.scrollHeight;
      this.shouldScrollToBottom = false;
    } catch (err) {
      console.error('Error scrolling to bottom:', err);
    }
  }

  //metodo para agregar un nuevo mensaje
  addMessage(message: Message): void {
    this.messages.push(message);
    this.shouldScrollToBottom = true;
  }

  //metodo para obtener la fecha y hora actual
  getCurrentTimestamp(): string {
    return new Date().toLocaleString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  //metodo para enviar un nuevo mensaje
  sendMessage() {
    if (this.newMessage.trim()) {
      const userMessage: Message = {
        text: this.newMessage,
        isUser: true,
        timestamp: this.getCurrentTimestamp(),
        role: 'user',
      };
      this.addMessage(userMessage);
      this.getAssistantResponse(this.newMessage);
      this.newMessage = '';
    }
  }

  //metodo para obtener la respuesta del asistente
  getAssistantResponse(userMessage: string) {
    this.isLoading = true;
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    });

     // Agregar la respuesta del asistente al historial de conversaciones (mantener el contexto de la conversación)
    const conversationHistory = this.messages.map(msg => ({
      role: msg.role,
      content: msg.text
    }));

    //especifica el modelo de GPT-3.5-turbo y se le otorga un system con el historial de conversaciones
    const body = {
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'Eres un asistente virtual de ventas útil y amigable.' },
        ...conversationHistory,
        { role: 'user', content: userMessage }
      ],
    };

    this.http.post<any>(`${this.apiUrl}/chat/completions`, body, { headers }).subscribe({
      next: (response) => {
        this.ngZone.run(() => {
          const botMessage: Message = {
            text: response.choices[0].message.content,
            isUser: false, // Indica que el asistente no es el usuario, de poner en "true" la respuesta del asistente se reflejará como si nosotros (verde) estuvieramos enviando el mensaje
            timestamp: this.getCurrentTimestamp(),
            role: 'assistant'
          };
          this.addMessage(botMessage);
          this.isLoading = false;
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('Error getting assistant response:', error);
          const errorMessage: Message = {
            text: 'Lo siento, hubo un error al procesar tu mensaje. Por favor, intenta de nuevo.',
            isUser: false,
            timestamp: this.getCurrentTimestamp(),
            role: 'assistant'
          };
          this.addMessage(errorMessage);
          this.isLoading = false;
        });
      }
    });
  }

  //metodo para manejar el evento de seleccionar un archivo
  onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.uploadFile(file);
    }
  }

  //metodo para subir un archivo
  uploadFile(file: File) {
    if (file.type.startsWith('image/')) {
      this.handleImageUpload(file);
    } else if (file.type.startsWith('audio/')) {
      this.handleAudioUpload(file);
    }
  }

  //metodo para manejar el evento de subir una imagen (aun no funciona)
  handleImageUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const imageMessage: Message = {
        text: 'Imagen subida',
        isUser: true,
        timestamp: this.getCurrentTimestamp(),
        isImage: true,
        imageUrl: e.target?.result as string,
        role: 'user',
      };
      this.addMessage(imageMessage);
      this.getModelResponse(file);
    };
    reader.readAsDataURL(file);
  }

  getModelResponse(image: File) {
    this.isLoading = true;
    const formData = new FormData();
    formData.append('file', image);

    this.http.post<any>(`${this.apiModelUrl}/modelo`, formData).subscribe({
      next: (modelResponse) => {
        this.ngZone.run(() => {
          const botMessage: Message = {
            text: modelResponse.prediction,
            isUser: false, // Indica que el asistente no es el usuario, de poner en "true" la respuesta del asistente se reflejará como si nosotros (verde) estuvieramos enviando el mensaje
            timestamp: this.getCurrentTimestamp(),
            role: 'assistant'
          };
          this.addMessage(botMessage);
          this.isLoading = false;
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('Error en procesar imagen', error);
          this.isLoading = false;
        });
      }
    });
  }

  //metodo para manejar el evento de subir un audio
  handleAudioUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      this.ngZone.run(() => {
        const audioMessage: Message = {
          text: 'Audio subido',
          isUser: true,
          timestamp: this.getCurrentTimestamp(),
          isAudio: true,
          audioUrl: e.target?.result as string,
          role: 'user'
        };
        this.addMessage(audioMessage);
        this.transcribeAudio(file);
      });
    };
    reader.readAsDataURL(file);
  }

  //metodo para manejar el evento de grabar un audio
  startRecording() {
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      this.mediaRecorder = new MediaRecorder(stream);
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };
      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.handleAudioUpload(
          new File([audioBlob], 'recorded_audio.webm', { type: 'audio/webm' })
        );
        this.audioChunks = [];
      };
      this.mediaRecorder.start();
      this.isRecording = true;
    });
  }

  //metodo para detener el evento de grabar un audio
  stopRecording() {
    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
      this.isRecording = false;
    }
  }

  //metodo para transcribir un audio
  transcribeAudio(audioFile: File) {
    this.isLoading = true;
    const formData = new FormData();
    formData.append('file', audioFile);
    formData.append('model', 'whisper-1');

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.apiKey}`
    });

    // Realiza la transcripción de audio
    this.http.post<any>(`${this.apiUrl}/audio/transcriptions`, formData, { headers }).subscribe({
      next: (transcriptionResponse) => {
        this.ngZone.run(() => {
          const lastMessage = this.messages[this.messages.length - 1];
          if (lastMessage.isAudio) {
            lastMessage.transcription = transcriptionResponse.text;
            this.getAssistantResponse(transcriptionResponse.text);
          }
          this.isLoading = false;
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('Error transcribing audio:', error);
          this.isLoading = false;
        });
      }
    });
  }

  //metodo para manejar el evento de arrastrar un archivo
  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  //metodo para manejar el evento de dejar de arrastrar un archivo
  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
  }

  //metodo para manejar el evento de soltar un archivo
  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.uploadFile(files[0]);
    }
    this.isDragging = false;
  }
}
